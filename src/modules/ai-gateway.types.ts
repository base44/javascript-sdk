/**
 * Connection details for the Base44 AI Gateway.
 */
export interface AiGatewayConnection {
  /** Base URL of the selected gateway provider. */
  baseURL: string;
  /**
   * Bearer token that authenticates the request. Empty string when the caller is
   * unauthenticated.
   */
  token: string;
  /**
   * Extra headers to send with every gateway request. Pass them to your client's
   * header option, such as `defaultHeaders` for the `openai` SDK and TanStack AI,
   * or `headers` for the Vercel AI SDK.
   *
   * On a client from {@linkcode createClientFromRequest | createClientFromRequest()},
   * this carries the signed `Base44-State` the platform attached to the request,
   * which a workspace IP allowlist requires. Otherwise it's empty.
   */
  headers: Record<string, string>;
}

/** Options for selecting an AI Gateway provider. */
export interface AiGatewayConnectionOptions {
  /** Gateway provider to connect to. Defaults to `openai`. */
  provider?: "openai" | "typesafe";
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
  /** Platform headers to forward on gateway requests */
  headers?: Record<string, string>;
}

/**
 * AI Gateway module for calling Base44's managed AI models from your own code.
 *
 * `connection()` hands you a `baseURL`, `token`, and `headers` that
 * authenticate as your Base44 app. An OpenAI-compatible client is any library, such as the `openai`
 * SDK or the Vercel AI SDK, that has the same request and response format
 * as OpenAI's API and lets you point it at a custom `baseURL`
 * instead of OpenAI's own servers. Pass `connection()`'s values to one of
 * these clients and it works against Base44's gateway exactly as it would
 * against the provider directly, no separate account, API key, or billing
 * setup with the underlying model provider required.
 *
 * `connection()` takes an optional `provider`, and each provider serves a different API:
 *
 * - `openai` (default): OpenAI-compatible chat completions and image endpoints.
 * - `typesafe`: structured evaluations with the `jev` model.
 *
 * Call `connection()` from a backend function rather than the browser. This
 * keeps your instructions, tools, and business logic server-side, and lets
 * you enforce your own auth, rate, and spend limits around the call. Which
 * token it returns depends on the authentication mode, described below.
 *
 * ## OpenAI-compatible models
 *
 * You can use any of the [models available through `InvokeLLM`](/developers/references/sdk/docs/type-aliases/integrations#invokellm).
 * Pass `'automatic'` to let Base44 choose one, or pin a specific model such
 * as `'claude_sonnet_4_6'`, `'gpt_5_5'`, or `'gemini_3_1_pro'`.
 *
 * ## Images
 *
 * The gateway also serves OpenAI's image endpoints, `/images/generations`
 * and `/images/edits`, so you can generate images and edit them using
 * reference images. Image requests use their own set of models: pass
 * `'automatic'` to let Base44 choose one, or pin a model such as
 * `'gemini_3_1_flash_image'` or `'gpt_image_2'`. For request options, the
 * full model list, and limits, see [Generate images with the AI Gateway](/developers/references/sdk/getting-started/ai-gateway-images).
 *
 * ## Structured evaluations
 *
 * The `typesafe` provider runs the `jev` evaluation model through
 * `@ai-sdk/typesafe-ai` and `experimental_evaluate` from the `ai` package,
 * version 7.0.105 or later. Pass `evaluationModel("jev")`; the gateway rejects
 * other model IDs, such as `"jev-latest"`. Give it some app state and a set of
 * questions, each a `choice`, `score`, or `boolean`. Choice and score answers
 * come back with `probabilities` per option; boolean answers with a single
 * `probability` of `true`. Use it to classify, score, or route records, then
 * apply your own thresholds and actions in code.
 *
 * ## Authentication Modes
 *
 * The mode determines which token `connection()` returns:
 *
 * - **Service role authentication** (`base44.asServiceRole.aiGateway`): Returns the service-role token. Use this from backend functions, including scheduled automations with no signed-in user. Every call spends the app's credits, so check the caller with `base44.auth.me()` first when a user triggers the function.
 * - **User authentication** (`base44.aiGateway`): Returns the signed-in app user's token. When an app restricts Core integrations, which is the default for new apps, public apps reject gateway calls made with a user token unless the AI Gateway is allowed.
 *
 * ## Billing and limits
 *
 * Requests are billed to your app's credit quota, which is the same shared
 * quota your app's built-in AI features use, and isn't split per user. If the
 * app runs out of credits, the gateway stops working for every user of the
 * app until the quota resets. A request is rejected before the model runs if
 * the app is out of credits. If you need to cap usage per user, build that
 * check yourself, for example by tracking calls per user in your own entity.
 */
export interface AiGatewayModule {
  /**
   * Gets the connection details for the Base44 AI Gateway.
   *
   * Returns the `baseURL`, `token`, and `headers` to pass to the selected provider client.
   *
   * @param options - Provider selection. Omit it to use the OpenAI-compatible gateway.
   *
   * @returns The gateway {@linkcode AiGatewayConnection | connection} (`baseURL`, `token`, and `headers`).
   *
   * @example
   * ```typescript
   * // Call a model directly
   * import { createClientFromRequest } from "@base44/sdk";
   * import OpenAI from "openai";
   *
   * // Runs inside a backend function
   * const base44 = createClientFromRequest(request);
   * const { baseURL, token, headers } = base44.asServiceRole.aiGateway.connection();
   * const openai = new OpenAI({ baseURL, apiKey: token, defaultHeaders: headers });
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
   * const { baseURL, token, headers } = base44.asServiceRole.aiGateway.connection();
   * // Point any OpenAI-compatible client at `baseURL` with `apiKey: token` and `headers`.
   * const models = createOpenAICompatible({ name: "base44", baseURL, apiKey: token, headers });
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
   *
   * @example
   * ```typescript
   * // Generate an image
   * import { createClientFromRequest } from "@base44/sdk";
   * import { generateImage } from "ai";
   * import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
   *
   * // Runs inside a backend function
   * const base44 = createClientFromRequest(request);
   * const { baseURL, token, headers } = base44.asServiceRole.aiGateway.connection();
   * const models = createOpenAICompatible({ name: "base44", baseURL, apiKey: token, headers });
   *
   * const { image } = await generateImage({
   *   model: models.imageModel("automatic"),
   *   prompt: "A watercolor illustration of a lighthouse at dawn",
   *   // Base44 options go under the provider name you passed above
   *   providerOptions: { base44: { aspect_ratio: "16:9" } },
   * });
   *
   * const file = new File([image.uint8Array], "lighthouse.png", { type: image.mediaType });
   * const { file_url } = await base44.integrations.Core.UploadFile({ file });
   * ```
   *
   * @example
   * ```typescript
   * // Route a support ticket with a structured evaluation
   * import { createClientFromRequest } from "@base44/sdk";
   * import { experimental_evaluate as evaluate } from "ai";
   * import { createTypeSafeAi } from "@ai-sdk/typesafe-ai";
   *
   * // Runs inside a backend function
   * const base44 = createClientFromRequest(request);
   * const { baseURL, token, headers } = base44.asServiceRole.aiGateway.connection({ provider: "typesafe" });
   * const typesafe = createTypeSafeAi({ baseURL, apiKey: token, headers });
   *
   * const { answers, providerMetadata } = await evaluate({
   *   model: typesafe.evaluationModel("jev"),
   *   maxRetries: 0, // Avoid automatic replays of billed requests
   *   state: { message: "Please refund today's duplicate charge." },
   *   questions: {
   *     department: {
   *       type: "choice",
   *       instructions: "Which team should handle this?",
   *       criteria: { billing: "Payments and refunds", support: "Other requests" },
   *     },
   *     urgency: {
   *       type: "score",
   *       instructions: "How urgent is this?",
   *       criteria: ["No deadline", "Requested today", "Immediate emergency"],
   *     },
   *     refund: { type: "boolean", instructions: "Is a refund explicitly requested?" },
   *   },
   * });
   *
   * // answers.department → { type: "choice", choice: "billing", probabilities: { billing: 0.97, support: 0.03 } }
   * // answers.urgency    → { type: "score", score: 1.2, probabilities: { 0: 0.1, 1: 0.6, 2: 0.3 } }
   * // answers.refund     → { type: "boolean", probability: 0.99 }
   * // Choice and score confidence is in providerMetadata.typesafe.confidence
   * // Pick your own thresholds and act on them in code
   * const autoRefund = answers.department.choice === "billing" && answers.refund.probability > 0.9;
   * ```
   */
  connection(options?: AiGatewayConnectionOptions): AiGatewayConnection;
}
