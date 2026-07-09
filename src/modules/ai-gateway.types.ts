/**
 * A connection to the Base44 AI Gateway.
 *
 * Contains the base URL and bearer token to use with any OpenAI-compatible
 * client pointed at the Base44 AI Gateway.
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
  /** Application ID */
  appId: string;
}

/**
 * AI Gateway module for calling Base44's managed AI models from your own code.
 *
 * The gateway exposes an OpenAI-compatible Chat Completions endpoint, so any
 * OpenAI-compatible SDK works against it:
 * - Build custom AI agents or call models directly from your backend code
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
   * // Inside a backend function: hand the connection to any OpenAI-compatible client
   * import { createClientFromRequest } from 'npm:@base44/sdk';
   *
   * Deno.serve(async (req) => {
   *   const base44 = createClientFromRequest(req);
   *   const { baseURL, token } = base44.aiGateway.connection();
   *
   *   // Point any OpenAI-compatible client at `baseURL` with `apiKey: token`.
   *   // Shown here with a raw request to the Chat Completions endpoint:
   *   const res = await fetch(`${baseURL}/chat/completions`, {
   *     method: 'POST',
   *     headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
   *     body: JSON.stringify({
   *       model: 'claude_sonnet_4_6',
   *       messages: [{ role: 'user', content: 'Hello!' }],
   *     }),
   *   });
   *   const data = await res.json();
   *   return Response.json({ text: data.choices[0].message.content });
   * });
   * ```
   */
  connection(): AiGatewayConnection;
}
