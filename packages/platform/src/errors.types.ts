/** Codes a {@link PlatformSocketError} reports. Session codes go to the session's `onError`, app codes to the subscription's. */
export type PlatformSocketErrorCode =
  /** Session. `getSessionToken` threw, took longer than 20 seconds or returned no token. Check the endpoint that opens sessions, then call `connect()` again. Retryable. */
  | "session_unavailable"
  /** Session. Base44 refused the session even with a fresh token: the token is invalid, or live updates aren't enabled for the workspace. Check that your server opens a new session on every call. Not retryable. */
  | "connection_denied"
  /** Session. The socket couldn't connect after five retries, or the server closed it. Call `connect()` again, for example when the tab next gets focus. Retryable. */
  | "connection_failed"
  /** Session. Your server ended the session, or its key was disabled, deleted or lost the **Watch app builder updates** permission. Open a new session if the page should still follow apps. Not retryable. */
  | "session_revoked"
  /** Session. Another socket connected with the same session token. Use one session per tab, or call `connect()` to take the session back. Not retryable. */
  | "session_replaced"
  /** Session or app. A frame didn't match the protocol. Update the SDK, then reconnect or subscribe again. Not retryable. */
  | "protocol_error"
  /** Session or app. You called `connect()` or `subscribe()` after `close()`. Create a new session with `init()`. Not retryable. */
  | "client_closed"
  /** App. The app isn't on the session's allowlist, the key can't watch it, or the socket joins too often. Add the app to the session from your server first. Not retryable. */
  | "access_denied"
  /** App. The app left the session's allowlist or moved to another workspace. Stop showing its live updates. Not retryable. */
  | "access_revoked"
  /** App. The subscription is active but its snapshot failed. Events still arrive, and the subscription doesn't end. Load the app's messages over the Apps API instead. */
  | "snapshot_unavailable"
  /** App. The session already has eight subscriptions. Unsubscribe from an app, or open another session. Not retryable. */
  | "subscription_limit"
  /** App. More than 1,000 deliveries waited for your callbacks. Make them faster, then subscribe again for a fresh snapshot. Retryable. */
  | "delivery_overflow"
  /** App. Your `onSnapshot` or `onEvent` callback threw or rejected. Fix the callback, then subscribe again. Not retryable. */
  | "handler_failed";
