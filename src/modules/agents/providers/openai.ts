import type { Tool, ToolChoice, JSONSchema, RunUsage } from "../agents.types.js";
import type { GenerateRequest, GenerateResult, LanguageModel, ModelMessage, ModelToolCall, FinishReason } from "../provider.js";

interface GatewayTransport { complete(body: Record<string, unknown>, opts?: { signal?: AbortSignal }): Promise<any> }

interface OpenAIToolDef { type: "function"; function: { name: string; description: string; parameters: JSONSchema } }

function serializeTools(tools?: Record<string, Tool>): OpenAIToolDef[] | undefined {
  if (!tools) return undefined;
  const entries = Object.entries(tools);
  if (entries.length === 0) return undefined;
  return entries.map(([name, t]) => ({ type: "function", function: { name, description: t.description, parameters: t.parameters } }));
}

/** Neutral messages (+ system) -> OpenAI chat messages. */
function toOpenAIMessages(system: string | undefined, messages: ModelMessage[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  if (system) out.push({ role: "system", content: system });
  for (const m of messages) {
    if (m.role === "user") out.push({ role: "user", content: m.content });
    else if (m.role === "assistant") {
      const msg: Record<string, unknown> = { role: "assistant", content: m.content ?? null };
      if (m.toolCalls?.length) {
        msg.tool_calls = m.toolCalls.map((c) => ({ id: c.id, type: "function", function: { name: c.name, arguments: JSON.stringify(c.args ?? {}) } }));
      }
      out.push(msg);
    } else {
      out.push({ role: "tool", tool_call_id: m.toolCallId, content: m.result });
    }
  }
  return out;
}

/** Build the OpenAI body using the same param whitelist as before (rejected params can never appear). */
function buildOpenAIBody(req: GenerateRequest): Record<string, unknown> {
  const body: Record<string, unknown> = { model: req.model, messages: toOpenAIMessages(req.system, req.messages) };
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

function parseOpenAICompletion(raw: any): GenerateResult {
  const choice = raw?.choices?.[0];
  const message = choice?.message ?? {};
  const toolCalls: ModelToolCall[] = (message.tool_calls ?? []).map((c: any) => {
    let args: unknown = {};
    try { args = JSON.parse(c.function?.arguments || "{}"); } catch { args = {}; }
    return { id: c.id, name: c.function?.name, args };
  });
  const u = raw?.usage ?? {};
  const usage: RunUsage = { promptTokens: u.prompt_tokens, completionTokens: u.completion_tokens, totalTokens: u.total_tokens, credits: u.base44_credits };
  return {
    text: message.content ?? "",
    toolCalls,
    finishReason: normalizeFinish(choice?.finish_reason, toolCalls.length > 0),
    usage,
    raw,
  };
}

/** OpenAI-compatible adapter over the Base44 gateway transport. @internal */
export function openAIProvider(transport: GatewayTransport): LanguageModel {
  return {
    async generate(req: GenerateRequest): Promise<GenerateResult> {
      const raw = await transport.complete(buildOpenAIBody(req), { signal: req.signal });
      return parseOpenAICompletion(raw);
    },
  };
}
