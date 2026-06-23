import type { Tool } from "./dynamic-agents.types.js";

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
