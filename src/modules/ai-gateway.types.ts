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
   * import { ToolLoopAgent, tool, stepCountIs, hasToolCall } from "ai";
   * import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
   * import { z } from "zod";
   *
   * const request = await base44.entities.ReturnRequest.get(returnId);
   * const { baseURL, token } = base44.aiGateway.connection();
   * // Point any OpenAI-compatible client at `baseURL` with `apiKey: token`.
   * const models = createOpenAICompatible({ name: "base44", baseURL, apiKey: token });
   *
   * const agent = new ToolLoopAgent({
   *   model: models("automatic"),
   *   instructions:
   *     "Decide whether this return looks fine or needs the owner's attention. " +
   *     "Check the customer's past orders, then submit your verdict.",
   *   tools: {
   *     searchOrders: tool({
   *       description: "This customer's past orders, optionally filtered by status",
   *       inputSchema: z.object({ status: z.string().optional() }),
   *       execute: ({ status }) => {
   *         const query = { customer_email: request.customer_email };
   *         if (status) query.status = status;
   *         return base44.entities.Order.filter(query, "-created_date", 50);
   *       },
   *     }),
   *     submitVerdict: tool({
   *       description: "Record the final verdict",
   *       inputSchema: z.object({ decision: z.enum(["approved", "flagged"]), reason: z.string() }),
   *       execute: ({ decision, reason }) =>
   *         base44.entities.ReturnRequest.update(returnId, { status: decision, review_note: reason }),
   *     }),
   *   },
   *   stopWhen: [stepCountIs(8), hasToolCall("submitVerdict")],
   * });
   *
   * await agent.generate({ prompt: `Review this return request: ${JSON.stringify(request)}` });
   * ```
   */
  connection(): AiGatewayConnection;
}
