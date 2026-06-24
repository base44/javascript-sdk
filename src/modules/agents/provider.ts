import type { Tool, ToolChoice, JSONSchema, RunUsage } from "./agents.types.js";

/** A parsed tool call the model wants to make. Args are already parsed (object), never a JSON string. @internal */
export interface ModelToolCall { id: string; name: string; args: unknown }

/**
 * Neutral, provider-agnostic conversation message. `system` is a message role in the
 * array (the dominant pattern in Vercel AI SDK and LangChain.js); each adapter
 * relocates it as needed (OpenAI keeps it as a system message; Anthropic lifts it to a
 * top-level param). Content is a string for now; a parts-array variant can be added
 * later for multimodal without breaking this union.
 * @internal
 */
export type ModelMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content?: string; toolCalls?: ModelToolCall[] }
  | { role: "tool"; toolCallId: string; toolName?: string; result: string };

/** Finish reasons normalized across providers. @internal */
export type FinishReason = "stop" | "length" | "tool-calls" | "content-filter" | "error" | "other";

/** A request to a language model. @internal */
export interface GenerateRequest {
  model: string;
  messages: ModelMessage[];
  tools?: Record<string, Tool>;
  temperature?: number;
  toolChoice?: ToolChoice;
  responseFormat?: JSONSchema;
  signal?: AbortSignal;
}

/** Normalized model output. @internal */
export interface GenerateResult {
  text: string;
  toolCalls: ModelToolCall[];
  finishReason: FinishReason;
  usage: RunUsage;
  /** Opaque vendor-specific extras (cache control, reasoning, safety, …). @internal */
  providerMetadata?: Record<string, unknown>;
  /** The raw vendor response, for advanced use. */
  raw: unknown;
}

/** The provider seam. Adapters translate neutral <-> vendor wire. @internal */
export interface LanguageModel {
  generate(req: GenerateRequest): Promise<GenerateResult>;
}
