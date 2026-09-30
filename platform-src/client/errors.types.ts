/** Server refusals and client transport/processing failures. */
export type PlatformSocketErrorCode =
  | "connection_denied" | "connection_failed" | "session_unavailable" | "session_revoked" | "session_replaced"
  | "access_denied" | "access_revoked" | "snapshot_unavailable" | "subscription_limit"
  | "delivery_overflow" | "protocol_error" | "handler_failed" | "client_closed";
