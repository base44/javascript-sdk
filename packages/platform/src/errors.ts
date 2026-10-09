import type { PlatformSocketErrorCode } from "./errors.types.js";

/**
 * The error the SDK reports when something goes wrong in a builder session.
 *
 * You don't create it. The SDK passes it to your `onError` callbacks, `connect()` rejects with it,
 * and `subscribe()` throws it. Check `code` to see what happened, then look the code up below:
 * - [Session error codes](#sessionerrorcode) go to the `onError` you pass to `init()`. The whole
 *   session is affected, and `appId` isn't set.
 * - [App error codes](#apperrorcode) go to the subscription's `onError`. Only that app is affected,
 *   and `appId` says which one.
 *
 * The error never carries the session token, a callback's exception, or the server's exception text.
 *
 * @example
 * ```typescript
 * // Handle session and app errors
 * const builder = client.builder.init({
 *   onError(error) {
 *     if (error.code === 'session_revoked') showSignedOut();
 *   },
 * });
 *
 * builder.subscribe(appId, {
 *   onSnapshot: renderChat,
 *   onEvent: applyEvent,
 *   onError(error) {
 *     if (error.code === 'access_revoked') hideLiveUpdates(error.appId);
 *   },
 * });
 * ```
 */
export class PlatformSocketError extends Error {
  /** What happened. One of the [session error codes](#sessionerrorcode) or [app error codes](#apperrorcode). */
  readonly code: PlatformSocketErrorCode;
  /** ID of the app the error is about. Set for app error codes, and not set for session error codes. */
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
