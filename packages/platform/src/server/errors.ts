import type { WebhookConfigurationErrorCode, WebhookVerificationErrorCode } from "./errors.types.js";

/** A webhook delivery that cannot be trusted. The message never includes the body or signature. */
export class WebhookVerificationError extends Error {
  /** Stable machine-readable reason. */
  readonly code: WebhookVerificationErrorCode;

  /** Create an error carrying only the reason. */
  constructor(code: WebhookVerificationErrorCode) {
    super(`Webhook verification failed: ${code}`);
    this.name = "WebhookVerificationError";
    this.code = code;
  }
}

/** Webhook public keys are missing or malformed, so no delivery can be verified. */
export class WebhookConfigurationError extends Error {
  /** Stable machine-readable reason. */
  readonly code: WebhookConfigurationErrorCode;

  /** Create an error describing the misconfiguration. */
  constructor(code: WebhookConfigurationErrorCode, detail: string) {
    super(`Webhook configuration: ${detail}`);
    this.name = "WebhookConfigurationError";
    this.code = code;
  }
}
