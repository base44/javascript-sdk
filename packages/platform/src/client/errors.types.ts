/**
 * Codes of errors that affect the whole session. They go to the `onError()` you pass to `init()`,
 * and `connect()` rejects with them. A retryable error is one where the same call can succeed again
 * without changing anything.
 */
export type SessionErrorCode =
  /**
   * The `getSession()` callback threw, took longer than 20 seconds, or returned a session without a
   * valid `session_token`, a `socket_url` that is an HTTP or HTTPS origin, or a `socket_path` that is
   * an absolute path.
   *
   * Check the endpoint that opens sessions, then call `connect()` again. Retryable. If a field is
   * invalid, fix it on your server first.
   */
  | "session_unavailable"
  /**
   * Base44 refused the session even with a fresh token. Either the token is invalid, or live updates
   * aren't turned on for the workspace.
   *
   * Check that your server opens a new session on every call. Not retryable.
   */
  | "connection_denied"
  /**
   * The socket couldn't connect after five retries, or the server closed the connection.
   *
   * Call `connect()` again, for example when the tab next gets focus. Retryable.
   */
  | "connection_failed"
  /**
   * Your server or an admin ended the session, or the workspace API key that opened the session lost
   * access.
   *
   * Open a new session from your server if the page should still follow apps. Not retryable.
   */
  | "session_revoked"
  /**
   * Another socket connected with the same session token.
   *
   * Use one session per tab. Don't reconnect automatically. Call `connect()` only to take the
   * session back on purpose. Not retryable.
   */
  | "session_replaced"
  /**
   * A message about the whole session didn't match the protocol.
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
 * Codes of errors for a single app. They go to the subscription's `onError()`, and `subscribe()`
 * throws `subscription_limit`. Every one ends the subscription except `snapshot_unavailable`.
 */
export type AppErrorCode =
  /**
   * The session doesn't have access to the app, or the connection subscribed to apps too often.
   *
   * Add the app to the session from your server, then subscribe again. Not retryable.
   */
  | "access_denied"
  /**
   * The session lost access to the app. Your server removed the app from the session, or the app
   * left the workspace.
   *
   * Stop showing the app's live updates. Not retryable.
   */
  | "access_revoked"
  /**
   * The subscription is active, but its snapshot failed. Events keep arriving.
   *
   * Load the app's messages from the Apps API instead.
   */
  | "snapshot_unavailable"
  /**
   * The session already has eight subscriptions.
   *
   * Unsubscribe from an app, or open another session. Not retryable.
   */
  | "subscription_limit"
  /**
   * More than 1,000 snapshots and events were waiting for your callbacks.
   *
   * Make the callbacks faster, then subscribe again for a fresh snapshot. Retryable.
   */
  | "delivery_overflow"
  /**
   * Your `onSnapshot()` or `onEvent()` callback threw or rejected.
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
