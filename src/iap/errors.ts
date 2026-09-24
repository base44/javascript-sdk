/**
 * Error classes for the in-app purchase module.
 *
 * Each class carries a `code` from `errors.types.ts`. Nothing here imports the
 * runtime helpers, so the runtime layer can throw these freely.
 *
 * @internal
 */
import type {
  IapApiErrorCode,
  IapConfigErrorCode,
  IapSetupErrorCode,
  IapStoreErrorCode,
  IapVerificationErrorCode,
} from "./errors.types.js";

/** Base class, so a caller can catch every error this module raises at once. */
export class IapError extends Error {
  /** Stable machine-readable code. */
  readonly code: string;

  constructor(code: string, message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "IapError";
    this.code = code;
    // `cause` is set by hand rather than passed to super: the emit target is
    // es2018, whose Error constructor takes no options bag.
    if (options && "cause" in options) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

/**
 * A signed Apple token was rejected.
 *
 * Deny by default: anything that raises this must be treated as "not
 * entitled", never as "probably fine".
 */
export class IapVerificationError extends IapError {
  declare readonly code: IapVerificationErrorCode;

  constructor(
    code: IapVerificationErrorCode,
    message: string,
    options?: { cause?: unknown }
  ) {
    super(code, message, options);
    this.name = "IapVerificationError";
  }
}

/** The module cannot start, or was asked for something its configuration does not allow. */
export class IapConfigError extends IapError {
  declare readonly code: IapConfigErrorCode;

  constructor(
    code: IapConfigErrorCode,
    message: string,
    options?: { cause?: unknown }
  ) {
    super(code, message, options);
    this.name = "IapConfigError";
  }
}

/**
 * The app's Base44 setup is not usable — an entity is missing, or its schema
 * has drifted from what the SDK writes.
 *
 * This is loud on purpose. A silently dropped field means purchase data is
 * being lost, which is worse than an outage.
 */
export class IapSetupError extends IapError {
  declare readonly code: IapSetupErrorCode;

  /** The entity the problem was found on. */
  readonly entityName?: string;
  /** Fields the entity dropped, when the code is `IAP_ENTITY_SCHEMA_DRIFT`. */
  readonly missingFields?: string[];

  constructor(
    code: IapSetupErrorCode,
    message: string,
    details?: { entityName?: string; missingFields?: string[]; cause?: unknown }
  ) {
    super(code, message, { cause: details?.cause });
    this.name = "IapSetupError";
    this.entityName = details?.entityName;
    this.missingFields = details?.missingFields;
  }
}

/** A read or write against the app's entities failed. */
export class IapStoreError extends IapError {
  declare readonly code: IapStoreErrorCode;

  /** The entity being read or written. */
  readonly entityName?: string;

  constructor(
    code: IapStoreErrorCode,
    message: string,
    details?: { entityName?: string; cause?: unknown }
  ) {
    super(code, message, { cause: details?.cause });
    this.name = "IapStoreError";
    this.entityName = details?.entityName;
  }
}

/** An App Store Server API call failed. */
export class IapApiError extends IapError {
  declare readonly code: IapApiErrorCode;

  /** The HTTP status Apple returned. */
  readonly httpStatus?: number;
  /** Apple's own numeric error code from the response body, e.g. `4040010`. */
  readonly appleErrorCode?: number;
  /** Apple's own error message from the response body. */
  readonly appleErrorMessage?: string;
  /**
   * When rate-limited: the value of Apple's `Retry-After` header.
   *
   * Apple sends an **absolute UNIX millisecond timestamp** here, not a delay.
   * Compare it against `Date.now()`; do not use it as a duration.
   */
  readonly retryAfter?: number;

  constructor(
    code: IapApiErrorCode,
    message: string,
    details?: {
      httpStatus?: number;
      appleErrorCode?: number;
      appleErrorMessage?: string;
      retryAfter?: number;
      cause?: unknown;
    }
  ) {
    super(code, message, { cause: details?.cause });
    this.name = "IapApiError";
    this.httpStatus = details?.httpStatus;
    this.appleErrorCode = details?.appleErrorCode;
    this.appleErrorMessage = details?.appleErrorMessage;
    this.retryAfter = details?.retryAfter;
  }
}
