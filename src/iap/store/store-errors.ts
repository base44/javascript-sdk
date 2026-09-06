/**
 * Turning a Base44 error into a decision.
 *
 * The important one is `duplicate_key`, and it is classified on **positive
 * evidence only**. Reading a transient server error as "the row already
 * exists" is the most expensive mistake available in this layer: the webhook
 * would answer Apple 200 with nothing stored, and Apple never retries a 200.
 * So anything ambiguous is `transient`, which produces a retry rather than a
 * silent loss.
 *
 * @internal
 */
import { IapStoreError } from "../errors.js";
import type { IapEntityName } from "./schemas.js";

/** Why a store call failed. */
export type IapStoreFailureKind =
  /** Positive evidence that the natural key is taken. Control flow, not a failure. */
  | "duplicate_key"
  /** A filter returned 404, so the entity does not exist in this app. */
  | "entity_missing"
  /** The credentials cannot do this. */
  | "permission"
  /** A server error, a rate limit, a timeout, or no response at all. Retrying may work. */
  | "transient"
  /** The row was rejected as too large. The raw-token premise is in trouble. */
  | "row_too_large"
  /** The request was malformed. A bug in this SDK. */
  | "invalid"
  /** Natural-id mode is on but the backend ignored the supplied id. */
  | "mode_mismatch"
  /** Anything unrecognised. Treated as transient. */
  | "unknown";

/** A classified store failure. */
export interface ClassifiedStoreFailure {
  readonly kind: IapStoreFailureKind;
  /** Whether retrying could plausibly succeed. */
  readonly retryable: boolean;
  /** The HTTP status, when there was a response. */
  readonly status?: number;
}

interface ErrorLike {
  status?: unknown;
  code?: unknown;
  message?: unknown;
  data?: unknown;
}

function textOf(error: ErrorLike): string {
  const parts = [
    typeof error.code === "string" ? error.code : "",
    typeof error.message === "string" ? error.message : "",
  ];
  const data = error.data;
  if (data && typeof data === "object") {
    const bag = data as { code?: unknown; message?: unknown; detail?: unknown };
    for (const value of [bag.code, bag.message, bag.detail]) {
      if (typeof value === "string") parts.push(value);
    }
  }
  return parts.join(" ").toLowerCase();
}

/** Duplicate-key wording seen from Base44 and the databases behind it. */
const DUPLICATE_SIGNATURES = [
  "duplicate key",
  "duplicate_key",
  "already exists",
  "already_exists",
  "unique constraint",
  "e11000",
];

/**
 * Whether this error is positive evidence that the natural key is taken.
 *
 * A 409 counts. A recognised duplicate phrase counts. Nothing else does —
 * including a bare 400, which a real duplicate might produce but so does a
 * malformed request.
 */
export function isDuplicateKeyError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as ErrorLike;
  if (candidate.status === 409) return true;
  const text = textOf(candidate);
  return DUPLICATE_SIGNATURES.some((signature) => text.includes(signature));
}

/** Classifies a failure from the entities API. */
export function classifyStoreError(error: unknown): ClassifiedStoreFailure {
  if (!error || typeof error !== "object") {
    return { kind: "unknown", retryable: true };
  }
  const candidate = error as ErrorLike;
  const status = typeof candidate.status === "number" ? candidate.status : undefined;

  if (isDuplicateKeyError(error)) {
    return { kind: "duplicate_key", retryable: false, status };
  }

  // A network failure or a timeout leaves `status` undefined, despite the SDK
  // typing it as a number. Treating that as anything but retryable would drop
  // a notification whenever the network hiccupped.
  if (status === undefined) {
    return { kind: "transient", retryable: true };
  }
  if (status === 404) {
    // The store only ever reads by filter, never by record id, so a 404 can
    // only mean the entity itself is not there.
    return { kind: "entity_missing", retryable: false, status };
  }
  if (status === 401 || status === 403) {
    return { kind: "permission", retryable: false, status };
  }
  if (status === 413) {
    return { kind: "row_too_large", retryable: false, status };
  }
  if (status === 429 || status >= 500) {
    return { kind: "transient", retryable: true, status };
  }
  if (status >= 400) {
    const text = textOf(candidate);
    if (text.includes("too large") || text.includes("payload size")) {
      return { kind: "row_too_large", retryable: false, status };
    }
    return { kind: "invalid", retryable: false, status };
  }
  return { kind: "unknown", retryable: true, status };
}

/** Wraps a classified failure as the error the ingestion layer catches. */
export function toStoreError(
  entityName: IapEntityName,
  operation: string,
  key: string | undefined,
  error: unknown
): IapStoreError {
  const classified = classifyStoreError(error);
  const where = key ? `${entityName}[${key}]` : entityName;
  const store = new IapStoreError(
    operation === "read" ? "IAP_READ_FAILED" : "IAP_WRITE_FAILED",
    `${operation} on ${where} failed (${classified.kind})`,
    { entityName, cause: error }
  );
  // Attached rather than constructor arguments so IapStoreError stays a small
  // public shape while the ingestion layer can still branch on the detail.
  (store as { kind?: IapStoreFailureKind }).kind = classified.kind;
  (store as { retryable?: boolean }).retryable = classified.retryable;
  return store;
}
