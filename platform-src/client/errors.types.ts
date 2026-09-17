/** Server subscription failures and client transport/processing failures. */
export type PlatformSocketErrorCode =
  | "invalid_room" | "invalid_cursor" | "access_denied" | "subscription_limit"
  | "resync_required" | "stream_unavailable" | "connection_denied"
  | "connection_failed" | "token_unavailable" | "protocol_error"
  | "handler_failed" | "client_closed";

