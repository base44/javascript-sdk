import type {
  Agent,
  AgentConfig,
  ChatMessage,
  RunInput,
  RunOptions,
  RunResult,
  Step,
  Tool,
} from "./agents.types.js";
import { serializeTools } from "./tool.js";

// ---------------------------------------------------------------------------
// Internal interfaces for the OpenAI-compatible completion shape.
// These cover only the fields the loop actually reads; unknown extra fields
// from the gateway are tolerated (no `[key: string]: unknown` needed since
// the response is typed as the intersection we care about).
// ---------------------------------------------------------------------------

/** @internal */
export interface OpenAIToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

/** @internal */
export interface OpenAIAssistantMessage {
  role: "assistant";
  content?: string | null;
  tool_calls?: OpenAIToolCall[];
}

/** @internal */
export interface OpenAIChoice {
  message: OpenAIAssistantMessage;
  finish_reason?: string;
}

/** @internal */
export interface OpenAIUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  /** Base44 gateway credit cost for the request. */
  base44_credits?: number;
}

/**
 * The subset of an OpenAI-compatible chat completion response that the loop reads.
 * The gateway may return additional fields; they are tolerated but not accessed.
 * @internal
 */
export interface OpenAICompletion {
  choices: OpenAIChoice[];
  usage?: OpenAIUsage;
}

/**
 * Builds the gateway request body from config + messages using an explicit whitelist.
 * Rejected params (max_tokens, stop, top_p, penalties, logit_bias, seed, n) can never
 * appear because only the supported keys are ever written.
 * @internal
 */
export function buildRequestBody(
  config: AgentConfig,
  messages: ChatMessage[]
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: config.model,
    messages,
  };
  if (config.temperature !== undefined) body.temperature = config.temperature;
  if (config.toolChoice !== undefined) body.tool_choice = config.toolChoice;
  if (config.responseFormat !== undefined) {
    body.response_format = {
      type: "json_schema",
      json_schema: { name: "response", schema: config.responseFormat, strict: true },
    };
  }
  const tools = serializeTools(config.tools);
  if (tools) body.tools = tools;
  return body;
}

const DEFAULT_MAX_STEPS = 8;

function inputToMessages(input: RunInput): ChatMessage[] {
  if ("messages" in input) return input.messages;
  return [{ role: "user", content: input.prompt }];
}

function stringifyResult(out: unknown): string {
  return typeof out === "string" ? out : JSON.stringify(out);
}

function mapUsage(raw: OpenAICompletion | null): RunResult["usage"] {
  const u = raw?.usage ?? {};
  return {
    promptTokens: u.prompt_tokens,
    completionTokens: u.completion_tokens,
    totalTokens: u.total_tokens,
    credits: u.base44_credits,
  };
}

/**
 * Creates an Agent from a config and a gateway transport.
 * @internal
 */
export function createAgent(
  agentConfig: AgentConfig,
  transport: { complete(body: Record<string, unknown>, opts?: { signal?: AbortSignal }): Promise<OpenAICompletion> }
): Agent {
  const maxSteps = agentConfig.maxSteps ?? DEFAULT_MAX_STEPS;
  const tools = agentConfig.tools;

  const agent: Agent = {
    async run(input: RunInput, options: RunOptions = {}): Promise<RunResult> {
      const messages: ChatMessage[] = [];
      if (agentConfig.system) messages.push({ role: "system", content: agentConfig.system });
      messages.push(...inputToMessages(input));

      const steps: Step[] = [];
      let raw: OpenAICompletion | null = null;

      for (let i = 0; i < maxSteps; i++) {
        const body = buildRequestBody(agentConfig, messages);
        raw = await transport.complete(body, { signal: options.abortSignal });

        const choice = raw.choices[0];
        const message: OpenAIAssistantMessage = choice?.message ?? { role: "assistant", content: "" };
        messages.push(message);

        const toolCalls = message.tool_calls;
        if (!toolCalls || toolCalls.length === 0) {
          return {
            text: message.content ?? "",
            steps,
            finishReason: choice?.finish_reason ?? "stop",
            usage: mapUsage(raw),
            raw,
          };
        }

        const toolResults: Step["toolResults"] = [];
        for (const call of toolCalls) {
          const name = call.function.name;
          const t = tools?.[name];
          let args: unknown = {};
          try {
            args = JSON.parse(call.function.arguments || "{}");
          } catch {
            args = {};
          }
          let resultContent: string;
          if (!t) {
            resultContent = `Error: tool "${name}" is not available.`;
          } else {
            try {
              resultContent = stringifyResult(await t.execute(args));
            } catch (e: unknown) {
              const err = e as { message?: string };
              resultContent = `Error: ${err?.message ?? String(e)}`;
            }
          }
          messages.push({ role: "tool", tool_call_id: call.id, content: resultContent });
          toolResults.push({ toolCallId: call.id, toolName: name, args, result: resultContent });
        }
        steps.push({ toolResults });
      }

      // maxSteps exhausted
      const lastMessage = raw?.choices[0]?.message;
      return {
        text: lastMessage?.content ?? "",
        steps,
        finishReason: "max_steps",
        usage: mapUsage(raw),
        raw,
      };
    },

    asTool(toolOpts: { name?: string; description: string }): Tool {
      return {
        description: toolOpts.description,
        parameters: {
          type: "object",
          properties: { prompt: { type: "string", description: "What to ask the sub-agent." } },
          required: ["prompt"],
        },
        execute: async (args: { prompt: string }) => {
          const result = await agent.run({ prompt: args.prompt });
          return result.text;
        },
      };
    },
  };

  return agent;
}

