/**
 * Codes of errors that affect the whole session. They go to the `onError` you pass to `init()`, and
 * `connect()` rejects with them. Retryable means the same call can succeed again without changing anything.
 */
export type SessionErrorCode =
  /**
   * `getSessionToken` threw, took longer than 20 seconds or returned no token.
   *
   * Check the endpoint that opens sessions, then call `connect()` again. Retryable.
   */
  | "session_unavailable"
  /**
   * Base44 refused the session even with a fresh token: the token is invalid, or live updates aren't enabled for the workspace.
   *
   * Check that your server opens a new session on every call. Not retryable.
   */
  | "connection_denied"
  /**
   * The socket couldn't connect after five retries, or the server closed it.
   *
   * Call `connect()` again, for example when the tab next gets focus. Retryable.
   */
  | "connection_failed"
  /**
   * Your server or an admin ended the session, or its key lost access.
   *
   * Open a new session from your server if the page should still follow apps. Not retryable.
   */
  | "session_revoked"
  /**
   * Another socket connected with the same session token.
   *
   * Use one session per tab. Don't reconnect automatically; call `connect()` only to take the session back on purpose. Not retryable.
   */
  | "session_replaced"
  /**
   * A session frame didn't match the protocol.
   *
   * Update the SDK, then call `connect()` again. Not retryable.
   */
  | "protocol_error"
  /**
   * You called `connect()` or `subscribe()` after `close()`.
   *
   * Create a new session with `init()`. Not retryable.
   */
  | "client_closed";

/**
 * Codes of errors for one app. They go to the subscription's `onError`, and `subscribe()` throws
 * `subscription_limit`. Every one ends the subscription except `snapshot_unavailable`.
 */
export type AppErrorCode =
  /**
   * The app isn't on the session's allowlist, or the socket joins too often.
   *
   * Add the app to the session from your server, then subscribe again. Not retryable.
   */
  | "access_denied"
  /**
   * The app left the session's allowlist, or its workspace.
   *
   * Stop showing the app's live updates. Not retryable.
   */
  | "access_revoked"
  /**
   * The subscription is active but its snapshot failed. Events keep arriving.
   *
   * Load the app's messages over the Apps API instead.
   */
  | "snapshot_unavailable"
  /**
   * The session already has eight subscriptions.
   *
   * Unsubscribe from an app, or open another session. Not retryable.
   */
  | "subscription_limit"
  /**
   * More than 1,000 deliveries waited for your callbacks.
   *
   * Make the callbacks faster, then subscribe again for a fresh snapshot. Retryable.
   */
  | "delivery_overflow"
  /**
   * Your `onSnapshot` or `onEvent` callback threw or rejected.
   *
   * Fix the callback, then subscribe again. Not retryable.
   */
  | "handler_failed"
  /**
   * An event for this app didn't match the protocol.
   *
   * Update the SDK, then subscribe again. Not retryable.
   */
  | "protocol_error";

/** Every code a {@link PlatformSocketError} reports. */
export type PlatformSocketErrorCode = SessionErrorCode | AppErrorCode;
