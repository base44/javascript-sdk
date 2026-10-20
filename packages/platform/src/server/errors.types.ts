/**
 * Codes of errors for a delivery that can't be trusted. Answer these with a 400. Base44 retries any
 * answer that isn't 2xx, so a genuine delivery that failed because of a passing problem verifies on the retry.
 */
export type WebhookVerificationErrorCode =
  /**
   * The request is missing one of the `webhook-id`, `webhook-timestamp` or `webhook-signature` headers.
   *
   * Check that a proxy in front of your endpoint forwards all request headers.
   */
  | "missing_headers"
  /**
   * The `webhook-timestamp` header is more than `toleranceSeconds` (300 by default) away from your server's clock, or isn't a number.
   *
   * Check your server's clock. A replayed old delivery fails this way too.
   */
  | "timestamp_outside_tolerance"
  /**
   * The `webhook-signature` header has no signature in the `v1a` scheme Base44 uses.
   *
   * The request didn't come from Base44, or a proxy rewrote the header.
   */
  | "no_signature_entries"
  /**
   * No signature matches any of your public keys.
   *
   * Check that you pass the request body exactly as received. Parsing the JSON and serializing it again
   * changes the bytes. Also check that your public keys belong to the workspace that sends the webhook.
   */
  | "signature_mismatch"
  /**
   * The signature is valid, but the body isn't a JSON event.
   *
   * This shouldn't happen with deliveries from Base44.
   */
  | "invalid_payload";

/**
 * Codes of errors that stop verification before it starts, because the public keys you passed can't
 * be used. They're about your deployment, not the request, so answer them with a 500. Base44 retries
 * the delivery, as it does for any answer that isn't 2xx, and it succeeds once you fix the problem.
 */
export type WebhookConfigurationErrorCode =
  /**
   * No public keys were passed, for example because an environment variable is unset.
   *
   * Pass your workspace's public keys to `verifyEvent()` or `createHandler()`.
   */
  | "missing_public_keys"
  /**
   * A public key isn't a base64-encoded 32-byte Ed25519 key, with or without the `whpk_` prefix.
   *
   * Copy the key again. A truncated key fails this way.
   */
  | "invalid_public_key"
  /**
   * The runtime can't import Ed25519 keys with WebCrypto.
   *
   * Run your server on Node.js 20 or later, or on an edge runtime that supports Ed25519 in WebCrypto.
   */
  | "unsupported_runtime";
