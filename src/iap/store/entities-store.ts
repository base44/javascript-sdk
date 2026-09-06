/**
 * The store, implemented over Base44 entities.
 *
 * The only file that touches the entities API, and the only one that knows
 * about its gaps. Four of them shape everything here:
 *
 * 1. **No upsert.** So an insert-or-merge is two calls, and the order is
 *    chosen per entity by which outcome is likelier.
 * 2. **No unique constraint.** So two writes can both create a row for one
 *    key. Reads collapse duplicates instead of assuming they cannot happen.
 * 3. **No compare-and-swap.** So `updateMany`'s query is used as the guard —
 *    it is evaluated server-side in one call, which is what makes newest-wins
 *    safe under concurrency. A plain update by id is banned: it is an
 *    unconditional overwrite and would lose the newer of two racing payloads.
 * 4. **`updated: 0` is ambiguous** between "no such row" and "the guard
 *    rejected it", so telling them apart costs an extra read.
 *
 * @internal
 */
import type { EntitiesModule, EntityHandler } from "../../modules/entities.types.js";
import { IapSetupError, IapStoreError } from "../errors.js";
import { systemClock, type Clock } from "../runtime/clock.js";
import { collapseDuplicates } from "./collapse.js";
import { isDuplicateKeyError, toStoreError } from "./store-errors.js";
import { IAP_ENTITY_NAMES, type IapEntityName } from "./schemas.js";
import type {
  IapEntityDescriptor,
  IapPageOptions,
  IapPageResult,
  IapPatch,
  IapPatchResult,
  IapStore,
  IapStoreMode,
  IapUpsertResult,
  IapWriteGuard,
} from "./store.types.js";

/** How many rows to fetch when looking up one key, so duplicates are visible. */
const DUPLICATE_PROBE_LIMIT = 5;

/** Keys per `$in` lookup. The filter travels in a URL query string. */
const KEYS_PER_REQUEST = 50;

const DEFAULT_PAGE_SIZE = 500;
const DEFAULT_LIMIT = 1000;
const MAX_LIMIT = 5000;

/** Inputs to {@link createEntitiesStore}. */
export interface CreateEntitiesStoreOptions {
  /**
   * Returns the entities module to write through.
   *
   * A getter rather than a value because it must be the **service-role**
   * module — ingestion writes rows on behalf of a user whose own permissions
   * would not allow it — and reaching for that throws when the client was
   * built without service-role credentials. Deferring it keeps constructing an
   * IAP client free of I/O and free of throwing, so the failure surfaces on
   * the first write with a message that says what is missing.
   */
  readonly getEntities: () => EntitiesModule;
  /** How rows are addressed. Defaults to `"query-guard"`. */
  readonly mode?: IapStoreMode;
  /** The clock, for tests. */
  readonly clock?: Clock;
}

/**
 * The store is in natural-id mode on a backend that ignores a caller-supplied
 * record id.
 *
 * Deliberately not routed through the generic classifier: that would label it
 * transient and retry it forever, when what is needed is a loud, permanent
 * failure naming the fix.
 */
function modeMismatchError(
  entityName: IapEntityName,
  key: string,
  assigned: string
): IapStoreError {
  const error = new IapStoreError(
    "IAP_WRITE_FAILED",
    `natural-id mode is on, but ${entityName} returned id ${JSON.stringify(
      assigned
    )} for key ${JSON.stringify(key)}. This backend does not honour a ` +
      "caller-supplied id, so de-duplication would never fire and a consumable " +
      "could be granted more than once. Run the store in query-guard mode.",
    { entityName }
  );
  (error as { kind?: string }).kind = "mode_mismatch";
  (error as { retryable?: boolean }).retryable = false;
  return error;
}

export function createEntitiesStore(
  options: CreateEntitiesStoreOptions
): IapStore {
  const mode: IapStoreMode = options.mode ?? "query-guard";
  const clock = options.clock ?? systemClock;

  function handlerFor<T>(descriptor: IapEntityDescriptor<T>): EntityHandler<T> {
    return entityHandler<T>(descriptor.name);
  }

  function entityHandler<T>(name: IapEntityName): EntityHandler<T> {
    let entities: EntitiesModule;
    try {
      entities = options.getEntities();
    } catch (cause) {
      throw new IapSetupError(
        "IAP_SERVICE_ROLE_REQUIRED",
        "in-app purchase records are written with service-role access, which this " +
          "client does not have. Create the client inside a Base44 backend function " +
          "with createClientFromRequest(request).",
        { entityName: name, cause }
      );
    }
    return entities[name] as unknown as EntityHandler<T>;
  }

  /**
   * Columns to request.
   *
   * Heavy columns — the raw tokens — are left out unless asked for, because
   * most reads only need the derived fields. The key and every cursor are
   * always included: without them a collapse cannot order duplicates.
   */
  function projection<T>(
    descriptor: IapEntityDescriptor<T>,
    fields: readonly (keyof T & string)[] | undefined
  ): (keyof T & string)[] | undefined {
    if (!fields) return undefined;
    const required = new Set<keyof T & string>([
      descriptor.keyField,
      ...(Object.values(descriptor.cursors) as (keyof T & string)[]),
      ...fields,
    ]);
    return [...required];
  }

  /** Builds the server-side guard for a write. */
  function guardQuery<T>(
    descriptor: IapEntityDescriptor<T>,
    key: string,
    guard: IapWriteGuard<T>
  ): Record<string, unknown> {
    const query: Record<string, unknown> = { [descriptor.keyField]: key };

    if (guard.equals) {
      for (const [field, value] of Object.entries(guard.equals)) {
        query[field] = value;
      }
    }

    if (guard.cursorBelow) {
      const column = descriptor.cursors[guard.cursorBelow.facet];
      if (!column) {
        throw new Error(
          `${descriptor.name} has no cursor facet ${JSON.stringify(
            guard.cursorBelow.facet
          )}`
        );
      }
      // Both branches are required. A bare `$lt` does not match a document
      // where the column is missing or null — MongoDB compares only within a
      // type — so a row written before this cursor existed would become
      // permanently unwritable.
      query.$or = [
        { [column]: { $lt: guard.cursorBelow.value } },
        { [column]: null },
      ];
    }

    return query;
  }

  function patchData<T>(
    descriptor: IapEntityDescriptor<T>,
    patch: IapPatch<T>
  ): Record<string, Record<string, unknown>> {
    const set: Record<string, unknown> = {};
    const excluded = new Set<string>(descriptor.mergeExcluded);

    for (const [field, value] of Object.entries(patch.set)) {
      // Omitting a nullish value is what "keep what we already know" means:
      // a bare device transaction must not erase renewal information that a
      // notification supplied.
      if (value === null || value === undefined) continue;
      if (excluded.has(field)) continue;
      set[field] = value;
    }

    const data: Record<string, Record<string, unknown>> = {};
    if (Object.keys(set).length > 0) data.$set = set;

    if (patch.clear && patch.clear.length > 0) {
      const unset: Record<string, unknown> = {};
      for (const field of patch.clear) {
        if (!excluded.has(field)) unset[field] = "";
      }
      if (Object.keys(unset).length > 0) data.$unset = unset;
    }

    if (patch.increment && Object.keys(patch.increment).length > 0) {
      data.$inc = { ...patch.increment };
    }

    return data;
  }

  async function rowsForKey<T>(
    descriptor: IapEntityDescriptor<T>,
    key: string,
    fields?: readonly (keyof T & string)[]
  ): Promise<T[]> {
    const handler = handlerFor(descriptor);
    const found = await handler.filter(
      { [descriptor.keyField]: key } as never,
      undefined,
      DUPLICATE_PROBE_LIMIT,
      undefined,
      projection(descriptor, fields) as never
    );
    return (found ?? []) as T[];
  }

  async function insertIfAbsent<T>(
    descriptor: IapEntityDescriptor<T>,
    key: string,
    row: T
  ): Promise<IapUpsertResult<T>> {
    const handler = handlerFor(descriptor);

    if (mode === "natural-id") {
      // The natural key doubles as the record id, so the backend rejects a
      // second insert and the duplicate race closes itself.
      let created: T;
      try {
        created = (await handler.create({
          ...(row as object),
          id: key,
        } as never)) as T;
      } catch (error) {
        if (isDuplicateKeyError(error)) {
          return { outcome: "stale", matched: 0, roundTrips: 1 };
        }
        throw toStoreError(descriptor.name, "insert", key, error);
      }

      // Fail closed, and outside the catch above so the reason survives.
      //
      // If the backend ignored the supplied id it handed back one of its own,
      // which means every insert looks new, de-duplication never fires, and a
      // consumable is granted again on every StoreKit re-delivery — silently,
      // and for money. This is not retryable and must not be reported as a
      // transient blip: the configuration is wrong and only a human can fix it.
      const assigned = (created as { id?: string } | null)?.id;
      if (assigned !== undefined && assigned !== key) {
        throw modeMismatchError(descriptor.name, key, assigned);
      }
      return { outcome: "inserted", inserted: created, matched: 1, roundTrips: 1 };
    }

    // query-guard: look first, then create. Two calls, and a narrow window in
    // which two callers both see nothing and both create. That is tolerated
    // rather than closed — the duplicate is an extra row, reads collapse it,
    // and every merge is idempotent.
    try {
      const existing = await rowsForKey(descriptor, key, [descriptor.keyField]);
      if (existing.length > 0) {
        return { outcome: "stale", matched: 0, roundTrips: 1 };
      }
      const created = (await handler.create(row as never)) as T;
      return { outcome: "inserted", inserted: created, matched: 1, roundTrips: 2 };
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        return { outcome: "stale", matched: 0, roundTrips: 2 };
      }
      throw toStoreError(descriptor.name, "insert", key, error);
    }
  }

  async function patchWhere<T>(
    descriptor: IapEntityDescriptor<T>,
    key: string,
    guard: IapWriteGuard<T>,
    patch: IapPatch<T>
  ): Promise<IapPatchResult> {
    const handler = handlerFor(descriptor);
    const data = patchData(descriptor, patch);

    if (Object.keys(data).length === 0) {
      // Nothing to write. Reporting `stale` keeps callers from treating a
      // no-op as a successful apply.
      return { outcome: "stale", matched: 0, roundTrips: 0 };
    }

    let updated: number;
    try {
      const result = await handler.updateMany(
        guardQuery(descriptor, key, guard) as never,
        data
      );
      updated = result?.updated ?? 0;
    } catch (error) {
      throw toStoreError(descriptor.name, "write", key, error);
    }

    if (updated > 0) {
      return { outcome: "applied", matched: updated, roundTrips: 1 };
    }

    // `updated: 0` cannot say whether the row is missing or the guard rejected
    // it, and the two need different follow-ups, so this costs one read.
    try {
      const existing = await rowsForKey(descriptor, key, [descriptor.keyField]);
      return {
        outcome: existing.length > 0 ? "stale" : "absent",
        matched: 0,
        roundTrips: 2,
      };
    } catch (error) {
      throw toStoreError(descriptor.name, "read", key, error);
    }
  }

  async function upsertNewestWins<T>(
    descriptor: IapEntityDescriptor<T>,
    key: string,
    cursor: { readonly facet: string; readonly value: number },
    row: T,
    patch: IapPatch<T>
  ): Promise<IapUpsertResult<T>> {
    const guard: IapWriteGuard<T> = { cursorBelow: cursor };

    if (descriptor.expect === "insert") {
      // The key is usually new, so try the insert first.
      const inserted = await insertIfAbsent(descriptor, key, row);
      if (inserted.outcome === "inserted") return inserted;

      const patched = await patchWhere(descriptor, key, guard, patch);
      return {
        outcome: patched.outcome === "absent" ? "stale" : patched.outcome,
        matched: patched.matched,
        roundTrips: inserted.roundTrips + patched.roundTrips,
      };
    }

    // The row usually exists, so try the guarded update first.
    const patched = await patchWhere(descriptor, key, guard, patch);
    if (patched.outcome !== "absent") {
      return {
        outcome: patched.outcome,
        matched: patched.matched,
        roundTrips: patched.roundTrips,
      };
    }

    const inserted = await insertIfAbsent(descriptor, key, row);
    if (inserted.outcome === "inserted") {
      return { ...inserted, roundTrips: patched.roundTrips + inserted.roundTrips };
    }

    // Someone else created it in between. The guard makes re-running correct:
    // it applies if this payload really is newer, and does nothing if not.
    const retry = await patchWhere(descriptor, key, guard, patch);
    return {
      outcome: retry.outcome === "absent" ? "stale" : retry.outcome,
      matched: retry.matched,
      roundTrips: patched.roundTrips + inserted.roundTrips + retry.roundTrips,
    };
  }

  async function getByKey<T>(
    descriptor: IapEntityDescriptor<T>,
    key: string,
    fields?: readonly (keyof T & string)[]
  ): Promise<T | null> {
    try {
      const rows = await rowsForKey(descriptor, key, fields);
      if (rows.length === 0) return null;
      return collapseDuplicates(descriptor, rows).rows[0] ?? null;
    } catch (error) {
      throw toStoreError(descriptor.name, "read", key, error);
    }
  }

  async function getByKeys<T>(
    descriptor: IapEntityDescriptor<T>,
    keys: readonly string[],
    fields?: readonly (keyof T & string)[]
  ): Promise<Map<string, T>> {
    const unique = [...new Set(keys)].filter((key) => key.length > 0);
    const out = new Map<string, T>();
    if (unique.length === 0) return out;

    const handler = handlerFor(descriptor);

    for (let i = 0; i < unique.length; i += KEYS_PER_REQUEST) {
      const chunk = unique.slice(i, i + KEYS_PER_REQUEST);
      let rows: T[];
      try {
        rows = ((await handler.filter(
          { [descriptor.keyField]: { $in: chunk } } as never,
          undefined,
          // Room for duplicates of every key in the chunk.
          chunk.length * DUPLICATE_PROBE_LIMIT,
          undefined,
          projection(descriptor, fields) as never
        )) ?? []) as T[];
      } catch (error) {
        throw toStoreError(descriptor.name, "read", undefined, error);
      }

      for (const row of collapseDuplicates(descriptor, rows).rows) {
        out.set(String((row as Record<string, unknown>)[descriptor.keyField]), row);
      }
    }

    return out;
  }

  async function query<T>(
    descriptor: IapEntityDescriptor<T>,
    filter: Readonly<Record<string, unknown>>,
    pageOptions: IapPageOptions<T> = {}
  ): Promise<IapPageResult<T>> {
    const handler = handlerFor(descriptor);
    const limit = Math.min(pageOptions.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const pageSize = Math.min(pageOptions.pageSize ?? DEFAULT_PAGE_SIZE, limit);

    const collected: T[] = [];
    let skip = 0;
    let roundTrips = 0;
    let truncated = false;

    while (collected.length < limit) {
      // Always an explicit, non-zero page size. The entities layer drops a
      // falsy limit and the server then applies its own default of 50, which
      // would quietly hide an older purchase.
      const size = Math.min(pageSize, limit - collected.length);
      let page: T[];
      try {
        page = ((await handler.filter(
          filter as never,
          pageOptions.sort as never,
          size,
          skip,
          projection(descriptor, pageOptions.fields) as never
        )) ?? []) as T[];
      } catch (error) {
        throw toStoreError(descriptor.name, "read", undefined, error);
      }
      roundTrips += 1;
      collected.push(...page);

      if (page.length < size) break;
      skip += size;
      if (collected.length >= limit) {
        truncated = true;
        break;
      }
    }

    const { rows, collapsed } = collapseDuplicates(descriptor, collected);
    return { rows, truncated, duplicatesCollapsed: collapsed, roundTrips };
  }

  async function healthcheck(): Promise<{ ok: boolean; missing: IapEntityName[] }> {
    const missing: IapEntityName[] = [];

    await Promise.all(
      IAP_ENTITY_NAMES.map(async (name) => {
        try {
          const handler = entityHandler<unknown>(name);
          await handler.filter({} as never, undefined, 1);
        } catch (error) {
          // A filter against a non-existent entity answers 404. Reading one
          // row by record id could not tell that apart from "no such row",
          // which is why the store never does.
          const status = (error as { status?: unknown }).status;
          if (status === 404) missing.push(name);
          else throw toStoreError(name, "read", undefined, error);
        }
      })
    );

    return { ok: missing.length === 0, missing };
  }

  return {
    insertIfAbsent,
    patchWhere,
    upsertNewestWins,
    getByKey,
    getByKeys,
    query,
    healthcheck,
  };
}

/** The clock this store reads, exposed so callers stamp rows consistently. */
export function storeClock(options: CreateEntitiesStoreOptions): Clock {
  return options.clock ?? systemClock;
}
