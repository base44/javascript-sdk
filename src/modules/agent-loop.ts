import type {
  Agent,
  AgentConfig,
  ChatMessage,
  DynamicAgentsModule,
  DynamicAgentsModuleConfig,
  RunInput,
  RunOptions,
  RunResult,
  Step,
  Tool,
} from "./dynamic-agents.types.js";
import { createGatewayTransport } from "./ai-gateway.js";
import { serializeTools } from "./tool.js";

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

function mapUsage(raw: any): RunResult["usage"] {
  const u = (raw && raw.usage) || {};
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
  transport: { complete(body: Record<string, unknown>, opts?: { signal?: AbortSignal }): Promise<any> }
): Agent {
  const maxSteps = agentConfig.maxSteps ?? DEFAULT_MAX_STEPS;
  const tools = agentConfig.tools;

  const agent: Agent = {
    async run(input: RunInput, options: RunOptions = {}): Promise<RunResult> {
      const messages: ChatMessage[] = [];
      if (agentConfig.system) messages.push({ role: "system", content: agentConfig.system });
      messages.push(...inputToMessages(input));

      const steps: Step[] = [];
      let raw: any = null;

      for (let i = 0; i < maxSteps; i++) {
        const body = buildRequestBody(agentConfig, messages);
        raw = await transport.complete(body, { signal: options.abortSignal });

        const choice = raw?.choices?.[0];
        const message = choice?.message ?? { role: "assistant", content: "" };
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
          const name = call.function?.name;
          const t = tools?.[name];
          let args: unknown = {};
          try {
            args = JSON.parse(call.function?.arguments || "{}");
          } catch {
            args = {};
          }
          let resultContent: string;
          if (!t) {
            resultContent = `Error: tool "${name}" is not available.`;
          } else {
            try {
              resultContent = stringifyResult(await t.execute(args));
            } catch (e: any) {
              resultContent = `Error: ${e?.message ?? String(e)}`;
            }
          }
          messages.push({ role: "tool", tool_call_id: call.id, content: resultContent });
          toolResults.push({ toolCallId: call.id, toolName: name, args, result: resultContent });
        }
        steps.push({ toolResults });
      }

      // maxSteps exhausted
      const lastMessage = raw?.choices?.[0]?.message;
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

/**
 * Creates the `base44.dynamicAgents` module.
 * @internal
 */
export function createDynamicAgentsModule(
  config: DynamicAgentsModuleConfig
): DynamicAgentsModule {
  const transport = createGatewayTransport(config);

  function create(agentConfig: AgentConfig): Agent {
    return createAgent(agentConfig, transport);
  }

  function run(
    runConfig: AgentConfig & ({ prompt: string } | { messages: ChatMessage[] }),
    options?: RunOptions
  ): Promise<RunResult> {
    if ("messages" in runConfig) {
      const { messages, ...agentConfig } = runConfig as AgentConfig & { messages: ChatMessage[] };
      return create(agentConfig).run({ messages }, options);
    }
    const { prompt, ...agentConfig } = runConfig as AgentConfig & { prompt: string };
    return create(agentConfig).run({ prompt }, options);
  }

  return { create, run };
}
