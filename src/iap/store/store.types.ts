/**
 * The storage contract, and everything the layer needs to know per entity.
 *
 * This interface exists because Base44 entities offer no upsert, no unique
 * constraint, no compare-and-swap and no transactions, while purchase data
 * needs all four behaviours. Every workaround lives behind these methods, so
 * the ingestion and read layers never see an entity quirk — and the day the
 * platform grows a real upsert, one file changes.
 *
 * @internal
 */
import type { IapEntityName } from "./schemas.js";

/** Everything the store needs to know about one entity. */
export interface IapEntityDescriptor<T> {
  /** The entity name in Base44. */
  readonly name: IapEntityName;
  /** The column holding the natural key, e.g. `transactionId`. */
  readonly keyField: keyof T & string;
  /**
   * Monotone ordering columns, by facet name.
   *
   * A facet is one independently-arriving piece of a row. A subscription has
   * two — its transaction and its renewal information — because they come from
   * different places at different times and each must only move forwards.
   */
  readonly cursors: Readonly<Record<string, keyof T & string>>;
  /** Whether the common case is a new row or an update to an existing one. */
  readonly expect: "insert" | "update";
  /** Columns a merge must never touch: insert-only, or owned by this SDK. */
  readonly mergeExcluded: readonly (keyof T & string)[];
  /** Columns where the oldest duplicate wins when collapsing, e.g. `recordedAt`. */
  readonly oldestWins: readonly (keyof T & string)[];
  /** Large columns left out of a default projection, e.g. `rawJws`. */
  readonly heavyFields: readonly (keyof T & string)[];
}

/**
 * A merge.
 *
 * `set` must already have nullish values stripped. Omitting a field means
 * "keep whatever is stored", which is what lets a bare device transaction
 * update a subscription row without erasing the renewal information a
 * notification put there. Clearing a field is therefore explicit, via `clear`.
 */
export interface IapPatch<T> {
  /** Fields to write. Never contains `null` or `undefined`. */
  readonly set: Partial<T>;
  /** Fields to blank deliberately. Used for a refund reversal. */
  readonly clear?: readonly (keyof T & string)[];
  /** Numeric fields to increment. */
  readonly increment?: Readonly<Record<string, number>>;
}

/** A condition the server evaluates before a write lands. */
export interface IapWriteGuard<T> {
  /** Every listed column must equal the given value. `null` matches stored null and missing. */
  readonly equals?: { readonly [K in keyof T]?: T[K] | null };
  /**
   * The row's cursor must be strictly older than this value, or absent.
   *
   * This is the newest-wins rule, evaluated server-side in a single call, so
   * two payloads racing for one row cannot lose each other.
   */
  readonly cursorBelow?: { readonly facet: string; readonly value: number };
}

/** What an insert-or-merge did. */
export type IapUpsertOutcome =
  /** A new row was created. */
  | "inserted"
  /** An existing row was updated. */
  | "applied"
  /** The row already held newer data, so nothing was written. */
  | "stale";

/** What a guarded patch did. */
export type IapPatchOutcome = "applied" | "stale" | "absent";

/** Shared result fields. */
export interface IapWriteResult {
  /**
   * How many rows the server reported changing.
   *
   * More than one means duplicate rows exist for this key, which is a repair
   * signal rather than an error — reads collapse them either way.
   */
  readonly matched: number;
  /** Round trips this call cost. Feeds the webhook latency budget. */
  readonly roundTrips: number;
}

/** The result of an insert-or-merge. */
export interface IapUpsertResult<T> extends IapWriteResult {
  readonly outcome: IapUpsertOutcome;
  /** The created row, when one was created. */
  readonly inserted?: T;
}

/** The result of a guarded patch. */
export interface IapPatchResult extends IapWriteResult {
  readonly outcome: IapPatchOutcome;
}

/** How to page through a query. */
export interface IapPageOptions<T> {
  /**
   * Sort column, single field only.
   *
   * Must be an immutable column. Sorting on something a concurrent write can
   * change makes a row shift between pages, so it is either seen twice or
   * missed.
   */
  readonly sort?: `-${keyof T & string}` | (keyof T & string);
  /**
   * Total cap on rows returned. Defaults to 1000, hard maximum 5000.
   *
   * Never pass zero. The SDK's entity layer drops a falsy limit, and the
   * server then applies its own default of 50 — which in this domain means
   * quietly hiding an old purchase and denying someone what they paid for.
   */
  readonly limit?: number;
  /** Rows per request. Defaults to 500. */
  readonly pageSize?: number;
  /** Columns to fetch. Defaults to everything except the descriptor's heavy fields. */
  readonly fields?: readonly (keyof T & string)[];
}

/** A page of rows, with duplicates already collapsed. */
export interface IapPageResult<T> {
  /** The rows, one per natural key. */
  readonly rows: T[];
  /** Whether the cap was reached, so the filter needs narrowing. */
  readonly truncated: boolean;
  /** How many duplicate rows were folded away. A repair signal. */
  readonly duplicatesCollapsed: number;
  /** Round trips this query cost. */
  readonly roundTrips: number;
}

/** How the store addresses rows. */
export type IapStoreMode =
  /**
   * Find the row by its natural key column, then create or guard-update it.
   *
   * The default, and the safe one. It costs one extra round trip per insert
   * but behaves correctly whether or not the backend honours a
   * caller-supplied record id.
   */
  | "query-guard"
  /**
   * Use the natural key as the record id, so a duplicate insert collides.
   *
   * One round trip cheaper, and it closes the duplicate-insert race outright —
   * but only correct if the backend actually honours the id. Opt in after
   * confirming that, never by default: on a backend that ignores the id, every
   * insert looks new, duplicate detection never fires, and a consumable gets
   * granted twice on every re-delivery. Silently.
   */
  | "natural-id";

/** What the store can do. */
export interface IapStore {
  /**
   * Creates a row only if its natural key is free. Never overwrites.
   *
   * This is the de-duplication claim: the caller learns whether it or someone
   * else got there first.
   */
  insertIfAbsent<T>(
    descriptor: IapEntityDescriptor<T>,
    key: string,
    row: T
  ): Promise<IapUpsertResult<T>>;

  /**
   * Applies a merge, server-side, only to rows matching the guard.
   *
   * The only way a payload-derived column is ever written. A plain update by
   * id is banned here: it is an unconditional overwrite, so two payloads
   * racing for one row would lose the newer one.
   */
  patchWhere<T>(
    descriptor: IapEntityDescriptor<T>,
    key: string,
    guard: IapWriteGuard<T>,
    patch: IapPatch<T>
  ): Promise<IapPatchResult>;

  /** Creates the row, or merges into it if the incoming payload is newer. */
  upsertNewestWins<T>(
    descriptor: IapEntityDescriptor<T>,
    key: string,
    cursor: { readonly facet: string; readonly value: number },
    row: T,
    patch: IapPatch<T>
  ): Promise<IapUpsertResult<T>>;

  /**
   * One row by natural key, with duplicates collapsed. `null` when absent.
   *
   * Always a filter, never a fetch by record id, so a 404 unambiguously means
   * "this entity does not exist in the app" rather than "no such row".
   */
  getByKey<T>(
    descriptor: IapEntityDescriptor<T>,
    key: string,
    fields?: readonly (keyof T & string)[]
  ): Promise<T | null>;

  /** Several rows by natural key, for planning a batch of writes. */
  getByKeys<T>(
    descriptor: IapEntityDescriptor<T>,
    keys: readonly string[],
    fields?: readonly (keyof T & string)[]
  ): Promise<Map<string, T>>;

  /** A filtered, paged, duplicate-collapsed query. */
  query<T>(
    descriptor: IapEntityDescriptor<T>,
    filter: Readonly<Record<string, unknown>>,
    options?: IapPageOptions<T>
  ): Promise<IapPageResult<T>>;

  /** Which of the four required entities the app is missing. */
  healthcheck(): Promise<{ ok: boolean; missing: IapEntityName[] }>;
}
