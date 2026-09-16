/** Server subscription failures and client transport/processing failures. */
export type PlatformSocketErrorCode =
  | "invalid_room" | "invalid_cursor" | "access_denied" | "subscription_limit"
  | "resync_required" | "stream_unavailable" | "connection_denied"
  | "connection_failed" | "token_unavailable" | "protocol_error"
  | "handler_failed" | "client_closed";

/** Sanitized failure. Original token-provider, handler and server exceptions are not retained. */
export class PlatformSocketError extends Error {
  /** Stable machine-readable category. */
  readonly code: PlatformSocketErrorCode;
  /** Associated app, when the server identifies a valid room. */
  readonly appId?: string;

  /** Create a sanitized error with no credential-bearing cause or payload. */
  constructor(code: PlatformSocketErrorCode, appId?: string) {
    super(`Platform socket: ${code}`);
    this.name = "PlatformSocketError";
    this.code = code;
    this.appId = appId;
  }
}
