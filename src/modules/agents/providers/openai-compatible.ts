import type { Tool, JSONSchema, RunUsage } from "../agents.types.js";
import type { GenerateRequest, GenerateResult, LanguageModel, ModelMessage, ModelToolCall, FinishReason } from "../provider.js";

interface GatewayTransport { complete(body: Record<string, unknown>, opts?: { signal?: AbortSignal }): Promise<any> }

interface ChatCompletionToolDef { type: "function"; function: { name: string; description: string; parameters: JSONSchema } }

function serializeTools(tools?: Record<string, Tool>): ChatCompletionToolDef[] | undefined {
  if (!tools) return undefined;
  const entries = Object.entries(tools);
  if (entries.length === 0) return undefined;
  return entries.map(([name, toolDef]) => ({
    type: "function",
    function: { name, description: toolDef.description, parameters: toolDef.parameters },
  }));
}

/** Neutral messages -> Chat Completions messages. System role in the array is passed through. */
function toChatMessages(messages: ModelMessage[]): Record<string, unknown>[] {
  const chatMessages: Record<string, unknown>[] = [];
  for (const message of messages) {
    if (message.role === "system") {
      chatMessages.push({ role: "system", content: message.content });
    } else if (message.role === "user") {
      chatMessages.push({ role: "user", content: message.content });
    } else if (message.role === "assistant") {
      const assistantMessage: Record<string, unknown> = { role: "assistant", content: message.content ?? null };
      if (message.toolCalls?.length) {
        assistantMessage.tool_calls = message.toolCalls.map((call) => ({
          id: call.id,
          type: "function",
          function: { name: call.name, arguments: JSON.stringify(call.args ?? {}) },
        }));
      }
      chatMessages.push(assistantMessage);
    } else {
      chatMessages.push({ role: "tool", tool_call_id: message.toolCallId, content: message.result });
    }
  }
  return chatMessages;
}

/** Build the Chat Completions body using the param whitelist (rejected params can never appear). */
function buildChatCompletionsBody(req: GenerateRequest): Record<string, unknown> {
  const body: Record<string, unknown> = { model: req.model, messages: toChatMessages(req.messages) };
  if (req.temperature !== undefined) body.temperature = req.temperature;
  if (req.toolChoice !== undefined) body.tool_choice = req.toolChoice;
  if (req.responseFormat !== undefined) {
    body.response_format = { type: "json_schema", json_schema: { name: "response", schema: req.responseFormat, strict: true } };
  }
  const tools = serializeTools(req.tools);
  if (tools) body.tools = tools;
  return body;
}

const FINISH: Record<string, FinishReason> = {
  stop: "stop", length: "length", tool_calls: "tool-calls", content_filter: "content-filter",
};
function normalizeFinish(raw: string | undefined, hasToolCalls: boolean): FinishReason {
  if (hasToolCalls) return "tool-calls";
  if (raw !== undefined && FINISH[raw]) return FINISH[raw];
  return "other";
}

function parseChatCompletion(raw: any): GenerateResult {
  const choice = raw?.choices?.[0];
  const message = choice?.message ?? {};
  const toolCalls: ModelToolCall[] = (message.tool_calls ?? []).map((call: any) => {
    let args: unknown = {};
    try {
      args = JSON.parse(call.function?.arguments || "{}");
    } catch {
      args = {};
    }
    return { id: call.id, name: call.function?.name, args };
  });
  const rawUsage = raw?.usage ?? {};
  const usage: RunUsage = {
    inputTokens: rawUsage.prompt_tokens,
    outputTokens: rawUsage.completion_tokens,
    totalTokens: rawUsage.total_tokens,
    credits: rawUsage.base44_credits,
  };
  return {
    text: message.content ?? "",
    toolCalls,
    finishReason: normalizeFinish(choice?.finish_reason, toolCalls.length > 0),
    usage,
    raw,
  };
}

/**
 * OpenAI-compatible provider: speaks the Chat Completions wire format over the Base44
 * gateway transport. Most vendors (and the gateway) expose this protocol; a future
 * `openai-responses` or native `anthropic` provider would sit beside this file.
 * @internal
 */
export function openAICompatibleProvider(transport: GatewayTransport): LanguageModel {
  return {
    async generate(req: GenerateRequest): Promise<GenerateResult> {
      const raw = await transport.complete(buildChatCompletionsBody(req), { signal: req.signal });
      return parseChatCompletion(raw);
    },
  };
}
