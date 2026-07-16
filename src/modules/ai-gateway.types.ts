/**
 * Connection details for the Base44 AI Gateway.
 */
export interface AiGatewayConnection {
  /** Base URL of the gateway's OpenAI-compatible Chat Completions endpoint. */
  baseURL: string;
  /**
   * Bearer token that authenticates the request. Empty string when the caller is
   * unauthenticated.
   */
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
 * `connection()` hands you a `baseURL` and `token` that authenticate as your
 * Base44 app. An OpenAI-compatible client is any library, such as the `openai`
 * SDK or the Vercel AI SDK, that has the same request and response format
 * as OpenAI's Chat Completions API and lets you point it at a custom `baseURL`
 * instead of OpenAI's own servers. Pass `connection()`'s values to one of
 * these clients and it works against Base44's gateway exactly as it would
 * against the provider directly, no separate account, API key, or billing
 * setup with the underlying model provider required.
 *
 * Call `connection()` from a backend function rather than the browser. This
 * keeps your instructions, tools, and business logic server-side, and lets
 * you enforce your own auth, rate, and spend limits around the call. The
 * `token` it returns is the caller's regular session token, the same one
 * used for every other SDK call.
 *
 * ## Models
 *
 * You can use any of the [models available through `InvokeLLM`](/developers/references/sdk/docs/type-aliases/integrations#invokellm).
 * Pass `'automatic'` to let Base44 choose one, or pin a specific model such
 * as `'claude_sonnet_4_6'`, `'gpt_5_5'`, or `'gemini_3_1_pro'`.
 *
 * ## Authentication Modes
 *
 * There's no permission difference between modes. Both just determine which
 * token `connection()` returns:
 *
 * - **User authentication** (`base44.aiGateway`): Returns the signed-in app user's token.
 * - **Service role authentication** (`base44.asServiceRole.aiGateway`): Returns the service-role token instead, for calling the gateway when there's no signed-in user, such as from a scheduled automation.
 *
 * ## Billing and limits
 *
 * Requests are billed to your app's credit quota, which is the same shared
 * quota your app's built-in AI features use, and isn't split per user. If the
 * app runs out of credits, the gateway stops working for every user of the
 * app until the quota resets. A request is rejected before the model runs if
 * the app is out of credits. If you need to cap usage per user, build that
 * check yourself, for example by tracking calls per user in your own entity.
 *
 * Streaming responses aren't supported yet, so leave `stream` unset on your requests.
 */
export interface AiGatewayModule {
  /**
   * Gets the connection details for the Base44 AI Gateway.
   *
   * Returns the `baseURL` and `token` to pass to any OpenAI-compatible client.
   *
   * @returns The gateway {@linkcode AiGatewayConnection | connection} (`baseURL` and `token`).
   *
   * @example
   * ```typescript
   * // Call a model directly
   * import { createClientFromRequest } from "@base44/sdk";
   * import OpenAI from "openai";
   *
   * // Runs inside a backend function
   * const base44 = createClientFromRequest(request);
   * const { baseURL, token } = base44.aiGateway.connection();
   * const openai = new OpenAI({ baseURL, apiKey: token });
   *
   * const response = await openai.chat.completions.create({
   *   model: "automatic",
   *   messages: [{ role: "user", content: "Summarize this week's top support tickets." }],
   * });
   *
   * console.log(response.choices[0].message.content);
   * ```
   *
   * @example
   * ```typescript
   * // Use a tool-calling agent
   * import { createClientFromRequest } from "@base44/sdk";
   * import { ToolLoopAgent, tool, stepCountIs, hasToolCall } from "ai";
   * import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
   * import { z } from "zod";
   *
   * // Runs inside a backend function, reviewing a return request
   * const base44 = createClientFromRequest(request);
   * const returnRequest = await base44.entities.ReturnRequest.get(returnId);
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
   *         const query = { customer_email: returnRequest.customer_email };
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
   * await agent.generate({ prompt: `Review this return request: ${JSON.stringify(returnRequest)}` });
   * ```
   */
  connection(): AiGatewayConnection;
}
