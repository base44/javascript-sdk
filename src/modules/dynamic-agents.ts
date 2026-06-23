// Re-export shim — all implementations have moved to tool.ts and agent-loop.ts.
export { tool, serializeTools } from "./tool.js";
export { createAgent, buildRequestBody, createDynamicAgentsModule } from "./agent-loop.js";
