/**
 * A connection to the Base44 AI Gateway.
 *
 * Contains the base URL and bearer token to use with any OpenAI-compatible client
 * (the OpenAI SDK, Mastra, and others) pointed at the Base44 AI Gateway.
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
  /** The app's own public base URL (e.g. https://my-app.base44.app). Preferred over
   * serverUrl for the gateway URL, since the gateway resolves the app by domain. */
  appBaseUrl?: string;
  /** Authentication token */
  token?: string;
}

/**
 * The AI Gateway module.
 *
 * Exposes the connection details for the Base44 AI Gateway so you can call it from
 * your own code using any OpenAI-compatible SDK — for example, to build a custom
 * agent on top of the gateway.
 */
export interface AiGatewayModule {
  /**
   * Gets the connection details for the Base44 AI Gateway.
   *
   * Returns the `baseURL` and `token` to pass to any OpenAI-compatible client (the
   * OpenAI SDK, Mastra, and others), so you can call the gateway from your own code
   * without constructing the URL or handling the token yourself.
   *
   * The `token` is the current caller's bearer token: the app user's token for
   * `base44.aiGateway`, or the service-role token for `base44.asServiceRole.aiGateway`.
   * When the caller is unauthenticated, `token` is an empty string and gateway
   * requests will be rejected.
   *
   * @returns The gateway {@linkcode AiGatewayConnection | connection} (`baseURL` and `token`).
   *
   * @example
   * ```typescript
   * // Inside a backend function, call the gateway with any OpenAI-compatible SDK
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
