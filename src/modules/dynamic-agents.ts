import type { AgentConfig, ChatMessage, Tool } from "./dynamic-agents.types.js";

/**
 * Defines a tool an agent can call.
 *
 * @example
 * ```typescript
 * const getWeather = tool({
 *   description: "Get the current weather for a city.",
 *   parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] },
 *   execute: async ({ city }) => ({ city, tempC: 28 }),
 * });
 * ```
 */
export function tool(t: Tool): Tool {
  return t;
}

/**
 * Maps a `{ name: Tool }` map to the OpenAI `tools[]` array. Returns `undefined`
 * when empty so the param is omitted from the request body.
 * @internal
 */
export function serializeTools(tools?: Record<string, Tool>): any[] | undefined {
  if (!tools) return undefined;
  const entries = Object.entries(tools);
  if (entries.length === 0) return undefined;
  return entries.map(([name, t]) => ({
    type: "function",
    function: { name, description: t.description, parameters: t.parameters },
  }));
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
