import type { PlatformSocketErrorCode } from "./errors.types.js";

/**
 * The error the SDK reports when something goes wrong with live updates.
 *
 * You don't create these errors. The SDK passes them to your `onError()` callbacks, rejects
 * `connect()` with them, and throws them from `subscribe()`. Check `code` to see what happened,
 * then look the code up below:
 * - Session error codes go to the `onError()` you pass to `init()`. The whole
 *   session is affected, and `appId` isn't set.
 * - App error codes go to the subscription's `onError()`. Only that app is
 *   affected, and `appId` says which one.
 *
 * These errors never carry the session token, a callback's exception, or the server's exception
 * text.
 *
 * @example
 * ```typescript
 * // Handle session and app errors
 * const chat = client.chat.init({
 *   async getSession() {
 *     const response = await fetch('/api/chat-socket-session', { method: 'POST' });
 *     return response.json();
 *   },
 *   // Session error codes: the whole session is affected
 *   onError(error) {
 *     if (error.code === 'session_revoked') showSignedOut();
 *   },
 * });
 *
 * chat.subscribe(appId, {
 *   onSnapshot: renderChat,
 *   onEvent: applyEvent,
 *   // App error codes: only this app is affected, and error.appId says which
 *   onError(error) {
 *     if (error.code === 'access_revoked') hideLiveUpdates(error.appId);
 *   },
 * });
 * ```
 */
export class PlatformSocketError extends Error {
  /** What happened. One of the session error codes or app error codes. */
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
