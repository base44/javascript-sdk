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
   * Base44 sent [`session.ended`](/developers/references/platform-sdk/live-updates/events#session-ended) with `revoked`.
   *
   * Open a new session from your server if the page should still follow apps. Not retryable.
   */
  | "session_revoked"
  /**
   * Base44 sent [`session.ended`](/developers/references/platform-sdk/live-updates/events#session-ended) with `replaced`: another socket connected with the same token.
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
   * Base44 sent [`room.access_denied`](/developers/references/platform-sdk/live-updates/events#room-access_denied).
   *
   * Add the app to the session from your server, then subscribe again. Not retryable.
   */
  | "access_denied"
  /**
   * Base44 sent [`room.access_revoked`](/developers/references/platform-sdk/live-updates/events#room-access_revoked).
   *
   * Stop showing the app's live updates. Not retryable.
   */
  | "access_revoked"
  /**
   * Base44 sent [`room.snapshot_unavailable`](/developers/references/platform-sdk/live-updates/events#room-snapshot_unavailable). The subscription stays active and events keep arriving.
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
