/**
 * Codes a {@link PlatformSocketError} reports. Session codes go to the session's `onError`, app codes to
 * the subscription's. Retryable means the same call can succeed again without changing anything.
 */
export type PlatformSocketErrorCode =
  /** Session. `getSessionToken` threw, took longer than 20 seconds or returned no token. Check the endpoint that opens sessions, then call `connect()` again. Retryable. */
  | "session_unavailable"
  /** Session. Base44 refused the session even with a fresh token: the token is invalid, or live updates aren't enabled for the workspace. Check that your server opens a new session on every call. Not retryable. */
  | "connection_denied"
  /** Session. The socket couldn't connect after five retries, or the server closed it. Call `connect()` again, for example when the tab next gets focus. Retryable. */
  | "connection_failed"
  /** Session. Reported for [`session.ended`](/developers/references/platform-sdk/live-updates/events#session-ended) with `revoked`. Open a new session from your server if the page should still follow apps. Not retryable. */
  | "session_revoked"
  /** Session. Reported for [`session.ended`](/developers/references/platform-sdk/live-updates/events#session-ended) with `replaced`. Use one session per tab. Don't reconnect automatically; call `connect()` only to take the session back on purpose. Not retryable. */
  | "session_replaced"
  /** Session or app. A frame didn't match the protocol. Update the SDK, then reconnect or subscribe again. Not retryable. */
  | "protocol_error"
  /** Session or app. You called `connect()` or `subscribe()` after `close()`. Create a new session with `init()`. Not retryable. */
  | "client_closed"
  /** App. Reported for [`room.access_denied`](/developers/references/platform-sdk/live-updates/events#room-access_denied). Add the app to the session from your server, then subscribe again. Not retryable. */
  | "access_denied"
  /** App. Reported for [`room.access_revoked`](/developers/references/platform-sdk/live-updates/events#room-access_revoked). Stop showing the app's live updates. Not retryable. */
  | "access_revoked"
  /** App. Reported for [`room.snapshot_unavailable`](/developers/references/platform-sdk/live-updates/events#room-snapshot_unavailable). The subscription stays active and events keep arriving. Load the app's messages over the Apps API instead. */
  | "snapshot_unavailable"
  /** App. The session already has eight subscriptions. Unsubscribe from an app, or open another session. Not retryable. */
  | "subscription_limit"
  /** App. More than 1,000 deliveries waited for your callbacks. Make them faster, then subscribe again for a fresh snapshot. Retryable. */
  | "delivery_overflow"
  /** App. Your `onSnapshot` or `onEvent` callback threw or rejected. Fix the callback, then subscribe again. Not retryable. */
  | "handler_failed";
