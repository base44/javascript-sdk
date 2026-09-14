/** Stable SDK failure categories; server response prose is never copied into errors. */
export type PlatformErrorCode =
  | "invalid_argument" | "server_only" | "http_error" | "invalid_response"
  | "network_error" | "timeout" | "aborted" | "token_store_error";

/** Safe error representation, suitable for returning to your own application. */
export interface PlatformErrorJSON {
  /** Always Base44PlatformError. */
  name: "Base44PlatformError";
  /** SDK-defined message containing no request or response bodies. */
  message: string;
  /** HTTP status, or 0 for a local, network, cancellation or storage failure. */
  status: number;
  /** Stable SDK category; inspect status for HTTP failures. */
  code: PlatformErrorCode;
}

/** All SDK failures use this error; no raw response, credential or fetch error is retained. */
export class Base44PlatformError extends Error {
  /** Create a safe error from an SDK category, message and optional HTTP status. */
  constructor(
    /** SDK failure category. */
    readonly code: PlatformErrorCode,
    message: string,
    /** HTTP status, or 0 if no HTTP failure response was received. */
    readonly status = 0,
  ) {
    super(message);
    this.name = "Base44PlatformError";
  }
  /** Return safe fields only; excludes stack traces and transport internals. */
  toJSON(): PlatformErrorJSON {
    return { name: "Base44PlatformError", message: this.message, status: this.status, code: this.code };
  }
}
