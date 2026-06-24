// src/modules/dynamic-agents.types.ts
// Re-export code-agent types from agents.types.ts (transition shim — kept for A2 additive phase)
export type {
  JSONSchema,
  Tool,
  ChatMessage,
  Step,
  RunUsage,
  RunResult,
  RunInput,
  RunOptions,
  ToolChoice,
  AgentConfig,
  Agent,
} from "./agents.types.js";

/** The `base44.dynamicAgents` module. */
export interface DynamicAgentsModule {
  /** Define a reusable agent. */
  create(config: import("./agents.types.js").AgentConfig): import("./agents.types.js").Agent;
  /** One-shot: `create(config).run({ prompt })`. */
  run(config: import("./agents.types.js").AgentConfig & import("./agents.types.js").RunInput, options?: import("./agents.types.js").RunOptions): Promise<import("./agents.types.js").RunResult>;
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
