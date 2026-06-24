import type { JSONSchema, Tool } from "./agents.types.js";

/**
 * The OpenAI function-tool format sent in the `tools[]` request array.
 * @internal
 */
export interface OpenAIToolDef {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: JSONSchema;
  };
}

/**
 * Defines a tool an agent can call.
 *
 * A tool combines a natural-language `description` (used by the model to decide
 * when to call the tool), a JSON Schema for its `parameters`, and an `execute`
 * function that runs when the model calls it.
 *
 * Pass the returned tool in the `tools` map of {@linkcode AgentsModule.create | base44.agents.create()}.
 *
 * @param t - The tool definition: `description`, `parameters` (JSON Schema), and `execute`.
 * @returns The same tool object, typed as {@linkcode Tool}.
 *
 * @example
 * ```typescript
 * import { tool } from "@base44/sdk";
 *
 * const getWeather = tool({
 *   description: "Get the current weather for a city.",
 *   parameters: {
 *     type: "object",
 *     properties: { city: { type: "string", description: "City name, e.g. 'Tel Aviv'" } },
 *     required: ["city"],
 *   },
 *   execute: async ({ city }) => {
 *     const data = await fetchWeatherAPI(city);
 *     return { city, tempC: data.temperature };
 *   },
 * });
 *
 * const agent = base44.agents.create({
 *   model: "claude_sonnet_4_6",
 *   tools: { getWeather },
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
export function serializeTools(tools?: Record<string, Tool>): OpenAIToolDef[] | undefined {
  if (!tools) return undefined;
  const entries = Object.entries(tools);
  if (entries.length === 0) return undefined;
  return entries.map(([name, t]) => ({
    type: "function",
    function: { name, description: t.description, parameters: t.parameters },
  }));
}
