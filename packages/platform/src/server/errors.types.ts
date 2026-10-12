/** Why a delivery was refused. Respond 400: the request is not a genuine, current Base44 event. */
export type WebhookVerificationErrorCode =
  | "missing_headers" | "timestamp_outside_tolerance" | "no_signature_entries" | "signature_mismatch" | "invalid_payload";

/** Why verification could not run at all. This is your deployment, not the request: let it surface as a 500 so Base44 retries. */
export type WebhookConfigurationErrorCode = "missing_public_keys" | "invalid_public_key";
