/**
 * A connection to the Base44 AI Gateway.
 *
 * Contains the base URL and bearer token to use with any OpenAI-compatible client
 * (OpenAI SDK, Mastra, Vercel AI SDK, and others) pointed at the Base44 AI
 * Gateway.
 */
export interface AiGatewayConnection {
  /** Base URL of the gateway's OpenAI-compatible endpoint. */
  baseURL: string;
  /** Bearer token used to authenticate requests to the gateway. */
  token: string;
}

/**
 * Configuration for the AI Gateway module.
 * @internal
 */
export interface AiGatewayModuleConfig {
  /** Server URL */
  serverUrl?: string;
  /** Authentication token */
  token?: string;
}

/**
 * AI Gateway module for calling Base44's managed AI models from your own code.
 *
 * The gateway exposes an OpenAI-compatible Chat Completions endpoint, so any
 * OpenAI-compatible SDK works against it:
 * - Build custom AI agents with agent SDKs such as Mastra or the Vercel AI SDK
 * - Uses your app's models, billing, and credit quota, no API key to manage
 *
 * Available in user authentication mode (`base44.aiGateway`) and with the
 * service-role token via `base44.asServiceRole.aiGateway`.
 */
export interface AiGatewayModule {
  /**
   * Gets the connection details for the Base44 AI Gateway.
   *
   * Returns the `baseURL` and `token` to pass to any OpenAI-compatible client.
   *
   * The `token` is the current caller's bearer token: the app user's token for
   * `base44.aiGateway`, or the service-role token for `base44.asServiceRole.aiGateway`.
   * When the caller is unauthenticated, `token` is an empty string.
   *
   * @returns The gateway {@linkcode AiGatewayConnection | connection} (`baseURL` and `token`).
   *
   * @example
   * ```typescript
   * // Build an AI agent with Mastra on top of the gateway, inside a backend function
   * import { createClientFromRequest } from 'npm:@base44/sdk';
   * import { Agent } from 'npm:@mastra/core/agent';
   * import { createTool } from 'npm:@mastra/core/tools';
   * import { createOpenAICompatible } from 'npm:@ai-sdk/openai-compatible';
   * import { z } from 'npm:zod';
   *
   * Deno.serve(async (req) => {
   *   const base44 = createClientFromRequest(req);
   *   const { baseURL, token } = base44.aiGateway.connection();
   *   const models = createOpenAICompatible({ name: 'base44', baseURL, apiKey: token });
   *
   *   const agent = new Agent({
   *     id: 'order-helper',
   *     name: 'order-helper',
   *     instructions: 'Help the user with their orders.',
   *     model: models('claude_sonnet_4_6'),
   *     tools: {
   *       lookupOrder: createTool({
   *         id: 'lookup-order',
   *         description: 'Fetch an order by id',
   *         inputSchema: z.object({ orderId: z.string() }),
   *         execute: async ({ orderId }) => base44.entities.Order.get(orderId),
   *       }),
   *     },
   *   });
   *
   *   const { text } = await agent.generate('Where is order 123?');
   *   return Response.json({ text });
   * });
   * ```
   *
   * @example
   * ```typescript
   * // Call a model directly with the OpenAI SDK
   * import { createClientFromRequest } from 'npm:@base44/sdk';
   * import OpenAI from 'npm:openai';
   *
   * Deno.serve(async (req) => {
   *   const base44 = createClientFromRequest(req);
   *   const { baseURL, token } = base44.aiGateway.connection();
   *
   *   const openai = new OpenAI({ baseURL, apiKey: token });
   *   const res = await openai.chat.completions.create({
   *     model: 'claude_sonnet_4_6',
   *     messages: [{ role: 'user', content: 'Hello!' }],
   *   });
   *   return Response.json({ text: res.choices[0].message.content });
   * });
   * ```
   */
  connection(): AiGatewayConnection;
}
