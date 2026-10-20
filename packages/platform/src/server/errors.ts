import type { WebhookConfigurationErrorCode, WebhookVerificationErrorCode } from "./errors.types.js";

/**
 * The error the SDK reports when a webhook delivery can't be trusted.
 *
 * You don't create these errors. The [`verifyEvent()`](/developers/references/platform-sdk/docs/interfaces/webhooks#verifyevent) method rejects with
 * them, and [`createHandler()`](/developers/references/platform-sdk/docs/interfaces/webhooks#createhandler) answers them with a 400 and passes
 * them to your `onError()`. Check `code` to see what happened, then look the code up below.
 *
 * These errors never carry the request body or its signature.
 *
 * @example
 * ```typescript
 * // Refuse a delivery that doesn't verify
 * try {
 *   const event = await platform.webhooks.verifyEvent(rawBody, request.headers, { publicKeys });
 * } catch (error) {
 *   if (error instanceof WebhookVerificationError) {
 *     return Response.json({ error: error.code }, { status: 400 });
 *   }
 *   throw error;
 * }
 * ```
 */
export class WebhookVerificationError extends Error {
  /** What happened. One of the verification error codes. */
  readonly code: WebhookVerificationErrorCode;

  /** @internal */
  constructor(code: WebhookVerificationErrorCode) {
    super(`Webhook verification failed: ${code}`);
    this.name = "WebhookVerificationError";
    this.code = code;
  }
}

/**
 * The error the SDK reports when the public keys you passed can't be used, so no delivery can be verified.
 *
 * You don't create these errors. The [`verifyEvent()`](/developers/references/platform-sdk/docs/interfaces/webhooks#verifyevent) method rejects with
 * them, and [`createHandler()`](/developers/references/platform-sdk/docs/interfaces/webhooks#createhandler) answers them with a 500 and passes
 * them to your `onError()`. Base44 retries the delivery, and the retries succeed once you fix the problem.
 *
 * @example
 * ```typescript
 * // Log a misconfigured deployment, and let it answer 500
 * export const POST = platform.webhooks.createHandler({
 *   publicKeys: process.env.BASE44_WEBHOOK_PUBLIC_KEYS,
 *   onError(error) {
 *     if (error instanceof WebhookConfigurationError) console.error('Check BASE44_WEBHOOK_PUBLIC_KEYS', error.code);
 *   },
 * });
 * ```
 */
export class WebhookConfigurationError extends Error {
  /** What's wrong with the keys. One of the configuration error codes. */
  readonly code: WebhookConfigurationErrorCode;

  /** @internal */
  constructor(code: WebhookConfigurationErrorCode, detail: string) {
    super(`Webhook configuration: ${detail}`);
    this.name = "WebhookConfigurationError";
    this.code = code;
  }
}
