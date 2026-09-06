/**
 * Folding duplicate rows into one.
 *
 * Base44 cannot enforce a unique column, so two writes racing for the same
 * natural key can both create a row. Reads therefore never assume one row per
 * key — they collapse whatever they find, which makes correctness independent
 * of whether a repair pass has run.
 *
 * The fold reproduces what a guarded merge would have produced: newest row
 * first, then the first non-null value for each field. So a loser row's
 * `finishedAt`, or a renewal token the newest row happens to lack, survives.
 *
 * Pure, and therefore testable without a network.
 *
 * @internal
 */
import type { IapEntityDescriptor } from "./store.types.js";

function cursorValue<T>(descriptor: IapEntityDescriptor<T>, row: T): number {
  const facets = Object.keys(descriptor.cursors);
  if (facets.length === 0) return 0;
  const column = descriptor.cursors[facets[0]] as keyof T;
  const value = row[column];
  return typeof value === "number" ? value : 0;
}

/**
 * Orders two candidates for the same key, newest first.
 *
 * The order is total and deterministic — cursor, then creation time, then the
 * record id — because two backend instances must give the same customer the
 * same answer. An unstable tie-break would make entitlement flap.
 */
function compareNewestFirst<T>(
  descriptor: IapEntityDescriptor<T>,
  a: T,
  b: T
): number {
  const byCursor = cursorValue(descriptor, b) - cursorValue(descriptor, a);
  if (byCursor !== 0) return byCursor;

  const aRecord = a as { created_date?: string; id?: string };
  const bRecord = b as { created_date?: string; id?: string };

  const byCreated = (bRecord.created_date ?? "").localeCompare(
    aRecord.created_date ?? ""
  );
  if (byCreated !== 0) return byCreated;

  return (bRecord.id ?? "").localeCompare(aRecord.id ?? "");
}

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined;
}

/** Folds one key's rows into a single row. */
function foldGroup<T>(descriptor: IapEntityDescriptor<T>, group: T[]): T {
  const ordered = [...group].sort((a, b) => compareNewestFirst(descriptor, a, b));
  const merged = { ...ordered[0] } as Record<string, unknown>;

  for (let i = 1; i < ordered.length; i += 1) {
    const candidate = ordered[i] as Record<string, unknown>;
    for (const field of Object.keys(candidate)) {
      if (isEmpty(merged[field]) && !isEmpty(candidate[field])) {
        merged[field] = candidate[field];
      }
    }
  }

  // A few columns record when something first happened, so the oldest value is
  // the true one rather than the newest.
  for (const field of descriptor.oldestWins) {
    let oldest: number | undefined;
    for (const row of ordered) {
      const value = (row as Record<string, unknown>)[field];
      if (typeof value === "number" && (oldest === undefined || value < oldest)) {
        oldest = value;
      }
    }
    if (oldest !== undefined) merged[field] = oldest;
  }

  return merged as T;
}

/** One row per natural key, plus how many duplicates were folded away. */
export interface CollapseResult<T> {
  readonly rows: T[];
  readonly collapsed: number;
}

/**
 * Collapses rows to one per natural key, preserving input order of first
 * appearance.
 */
export function collapseDuplicates<T>(
  descriptor: IapEntityDescriptor<T>,
  rows: readonly T[]
): CollapseResult<T> {
  const groups = new Map<string, T[]>();
  const order: string[] = [];

  for (const row of rows) {
    const key = String((row as Record<string, unknown>)[descriptor.keyField]);
    const existing = groups.get(key);
    if (existing) {
      existing.push(row);
    } else {
      groups.set(key, [row]);
      order.push(key);
    }
  }

  let collapsed = 0;
  const out: T[] = [];
  for (const key of order) {
    const group = groups.get(key) as T[];
    if (group.length > 1) collapsed += group.length - 1;
    out.push(group.length === 1 ? group[0] : foldGroup(descriptor, group));
  }

  return { rows: out, collapsed };
}
