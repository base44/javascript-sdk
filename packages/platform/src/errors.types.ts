/**
 * Codes a {@link PlatformSocketError} reports.
 *
 * - `connection_denied`: Base44 refused the session even with a fresh token. The workspace, key or session isn't usable.
 * - `connection_failed`: The socket couldn't connect or reconnect.
 * - `session_unavailable`: `getSessionToken` failed, timed out or returned no token.
 * - `session_revoked`: Your server or an admin ended the session. Don't reconnect.
 * - `session_replaced`: Another socket took over the session. Stop, or call `connect()` to take it back.
 * - `access_denied`: The app isn't on the session's allowlist, or the socket joins too often.
 * - `access_revoked`: The app left the session's allowlist or workspace. Don't subscribe again.
 * - `snapshot_unavailable`: The subscription is active but its snapshot failed. Events still arrive.
 * - `subscription_limit`: The session already has eight subscriptions.
 * - `delivery_overflow`: 1,000 deliveries queued for the app. Subscribe again for a fresh snapshot.
 * - `protocol_error`: A frame didn't match the protocol.
 * - `handler_failed`: Your `onSnapshot` or `onEvent` callback threw or rejected.
 * - `client_closed`: The session was closed.
 */
export type PlatformSocketErrorCode =
  | "connection_denied" | "connection_failed" | "session_unavailable" | "session_revoked" | "session_replaced"
  | "access_denied" | "access_revoked" | "snapshot_unavailable" | "subscription_limit"
  | "delivery_overflow" | "protocol_error" | "handler_failed" | "client_closed";
