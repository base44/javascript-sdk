// src/modules/dynamic-agents.types.ts

/**
 * A JSON Schema object describing a tool's input parameters.
 * Use the standard JSON Schema `object` shape: `{ type: "object", properties: {...}, required: [...] }`.
 */
export type JSONSchema = Record<string, unknown>;

/**
 * A tool an agent can call. Create one with {@linkcode tool | tool()}, or derive it from a
 * resource with `.asTool()`.
 */
export interface Tool {
  /** Natural-language description the model uses to decide when to call the tool. */
  description: string;
  /** JSON Schema for the tool's arguments. */
  parameters: JSONSchema;
  /** Runs the tool. Receives parsed arguments; returns any JSON-serializable value (or a string). */
  execute: (args: any) => Promise<unknown> | unknown;
}

/** An OpenAI-shaped chat message used internally and accepted by {@linkcode Agent.run}. */
export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

/** One iteration of the agent loop: the tool calls the model made and their results. */
export interface Step {
  toolResults: Array<{
    toolCallId: string;
    toolName: string;
    args: unknown;
    result: string;
  }>;
}

/** Token/credit usage for a run. `credits` is the Base44 gateway's `base44_credits`. */
export interface RunUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  credits?: number;
}

/** Result of {@linkcode Agent.run} / {@linkcode DynamicAgentsModule.run}. */
export interface RunResult {
  /** The model's final text output. */
  text: string;
  /** The loop history (one entry per step that made tool calls). */
  steps: Step[];
  /** Why the run ended: `"stop"` (model finished), `"tool_calls"`, or `"max_steps"`. */
  finishReason: string;
  /** Token and credit usage from the final completion. */
  usage: RunUsage;
  /** The raw final completion body, for advanced use. */
  raw: unknown;
}

/** Input to {@linkcode Agent.run}: either a single prompt or a full message list. */
export type RunInput = { prompt: string } | { messages: ChatMessage[] };

/** Per-run options. */
export interface RunOptions {
  /** Abort the run (and the in-flight gateway request). */
  abortSignal?: AbortSignal;
}

/** OpenAI-compatible tool choice. */
export type ToolChoice =
  | "auto"
  | "none"
  | "required"
  | { type: "function"; function: { name: string } };

/** Configuration for a dynamic agent. */
export interface AgentConfig {
  /** Model alias (e.g. `"claude_sonnet_4_6"`, `"gpt_5_mini"`) or vendor id. */
  model: string;
  /** System prompt. */
  system?: string;
  /** Tools the agent may call, keyed by name. */
  tools?: Record<string, Tool>;
  /** Max loop iterations before stopping. Default `8`. */
  maxSteps?: number;
  /** Sampling temperature. Omitted unless set. Note: GPT-5 models only accept `1`. */
  temperature?: number;
  /** A JSON Schema to constrain output to structured JSON (`response_format: json_schema`). */
  responseFormat?: JSONSchema;
  /** Controls whether/which tool the model must call. */
  toolChoice?: ToolChoice;
}

/** A reusable dynamic agent. */
export interface Agent {
  /** Run the agent's tool-calling loop to completion. */
  run(input: RunInput, options?: RunOptions): Promise<RunResult>;
  /**
   * Turn this agent into a {@linkcode Tool} so another agent can call it as a sub-agent.
   * (Implemented in Effort 2.)
   */
  asTool(opts: { name?: string; description: string }): Tool;
}

/** The `base44.dynamicAgents` module. */
export interface DynamicAgentsModule {
  /** Define a reusable agent. */
  create(config: AgentConfig): Agent;
  /** One-shot: `create(config).run({ prompt })`. */
  run(config: AgentConfig & { prompt: string }, options?: RunOptions): Promise<RunResult>;
}

/**
 * Configuration for the dynamic-agents module.
 *
 * Note: the gateway resolves the app by request Host, so no `appId` is needed here —
 * `serverUrl` must be an app-resolving domain.
 * @internal
 */
export interface DynamicAgentsModuleConfig {
  serverUrl: string;
  /** Returns the current bearer token at call time (thunk — never a captured string). */
  getToken: () => string | undefined;
}
