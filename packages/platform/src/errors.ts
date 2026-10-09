import type { PlatformSocketErrorCode } from "./errors.types.js";

/**
 * An error from a builder session or subscription.
 *
 * Check `code` to decide what to do. The error never carries the session token, a callback's
 * exception, or the server's exception text.
 *
 * @example
 * ```typescript
 * // Handle a session error
 * const builder = client.builder.init({
 *   onError(error) {
 *     if (error.code === 'session_revoked') showSignedOut();
 *   },
 * });
 * ```
 */
export class PlatformSocketError extends Error {
  /** The error code. See [session error codes](#sessionerrorcode) and [app error codes](#apperrorcode). */
  readonly code: PlatformSocketErrorCode;
  /** ID of the app the error is about, when it concerns one subscription. */
  readonly appId?: string;

  /**
   * Creates an error. The SDK creates these; you don't need to.
   *
   * @param code - Error code.
   * @param appId - ID of the app the error is about.
   * @internal
   */
  constructor(code: PlatformSocketErrorCode, appId?: string) {
    super(`Platform socket: ${code}`);
    this.name = "PlatformSocketError";
    this.code = code;
    this.appId = appId;
  }
}
