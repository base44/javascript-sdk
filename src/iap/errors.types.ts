/**
 * Error codes the in-app purchase module can raise.
 *
 * Every code is a stable string. Generated code and support tooling branch on
 * these, so a code is never renamed — a new situation gets a new code.
 */

/**
 * Why a signed Apple token was rejected.
 *
 * The first eight come straight from the verification algorithm Apple
 * describes; the last two are this SDK's own.
 */
export type IapVerificationErrorCode =
  /** The token is not three base64url segments separated by dots. */
  | "INVALID_JWS_FORMAT"
  /** The JWS header named an algorithm other than `ES256`. */
  | "UNSUPPORTED_ALG"
  /** The `x5c` header did not carry exactly three certificates. */
  | "INVALID_CHAIN_LENGTH"
  /** A certificate failed to parse, was outside its validity window, or lacked a required marker. */
  | "INVALID_CERTIFICATE"
  /** A certificate was revoked. Only reachable with online checks, which v1 does not support. */
  | "CERTIFICATE_REVOKED"
  /** The signature did not verify against the leaf certificate's public key. */
  | "INVALID_SIGNATURE"
  /** The payload's `bundleId`, or its `appAppleId` in production, did not match the configuration. */
  | "INVALID_APP_IDENTIFIER"
  /** The payload's `environment` was not one this app accepts. */
  | "INVALID_ENVIRONMENT"
  /** A transient failure. Retrying may succeed. */
  | "RETRYABLE_VERIFICATION_FAILURE"
  /**
   * The chain anchored at a root this SDK cannot verify against — an RSA root.
   *
   * Current App Store tokens chain to Apple Root CA - G3, which is ECDSA
   * P-384. Apple Root CA - G2 and Apple Inc. Root are RSA and are pinned for
   * completeness, but v1 verifies ECDSA signatures only. This is never
   * downgraded to a pass.
   */
  | "UNSUPPORTED_CERT_ALGORITHM";

/** Why the module refused to start, or could not use its configuration. */
export type IapConfigErrorCode =
  /** A required configuration field was missing or malformed. */
  | "IAP_INVALID_CONFIG"
  /** `onlineChecks: true` was requested. Certificate revocation lookups are not implemented in v1. */
  | "IAP_ONLINE_CHECKS_UNSUPPORTED"
  /** The runtime has no WebCrypto. Needs Deno, Node 18 or later, or a secure browser context. */
  | "IAP_WEBCRYPTO_UNAVAILABLE"
  /** The runtime has no `fetch`. Needs Deno, Node 18 or later, or a browser. */
  | "IAP_FETCH_UNAVAILABLE"
  /** An App Store Server API call was made without `serverApi` credentials configured. */
  | "IAP_SERVER_API_NOT_CONFIGURED";

/** Why the app's own Base44 setup is not usable for in-app purchases. */
export type IapSetupErrorCode =
  /** One of the four required entities does not exist in this app. */
  | "IAP_ENTITY_MISSING"
  /** An entity exists but silently dropped a field the SDK wrote. Its schema has drifted. */
  | "IAP_ENTITY_SCHEMA_DRIFT"
  /** The client was created without service-role credentials, so it cannot write. */
  | "IAP_SERVICE_ROLE_REQUIRED";

/** Why a read or write against the app's entities failed. */
export type IapStoreErrorCode =
  /** The write did not land. Callers must not report success to Apple or finish a transaction. */
  | "IAP_WRITE_FAILED"
  /** The read did not complete. */
  | "IAP_READ_FAILED";

/** Why an App Store Server API call failed. */
export type IapApiErrorCode =
  /** Apple answered with an error status. Inspect `appleErrorCode` for which. */
  | "IAP_API_ERROR"
  /** Apple rate-limited the call. `retryAfter` carries the absolute timestamp to retry after. */
  | "IAP_API_RATE_LIMITED"
  /** The transaction id exists in neither the production nor the sandbox environment. */
  | "IAP_API_TRANSACTION_NOT_FOUND";
