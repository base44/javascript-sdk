// An in-memory stand-in for Base44 entities, faithful to the behaviour the
// store layer works around.
//
// The parts that matter, and that a looser fake would paper over:
//
// - `updateMany`'s query is evaluated server-side, and it reports only how
//   many rows changed — never whether a row existed but failed the guard.
// - `$lt` follows MongoDB type-bracketing: it does NOT match a document where
//   the field is missing or null. That is exactly why the store's cursor guard
//   is written as `$or: [{cursor: {$lt: v}}, {cursor: null}]`.
// - Nothing enforces uniqueness, so two creates for one natural key both
//   succeed and leave duplicate rows behind.
// - A filter against an entity the app does not have answers 404.

interface Row extends Record<string, unknown> {
  id: string;
  created_date: string;
}

type Query = Record<string, unknown>;

/** How the fake should misbehave. */
export interface FakeEntitiesOptions {
  /** Entity names that do not exist in this app. Any filter on them answers 404. */
  readonly missingEntities?: readonly string[];
  /** Entity names whose writes fail with a 503. */
  readonly failWritesOn?: readonly string[];
  /** Entity names whose writes fail with a 409, as a duplicate key would. */
  readonly duplicateKeyOn?: readonly string[];
  /** Whether a caller-supplied `id` is honoured. Off models the pessimistic world. */
  readonly honourSuppliedId?: boolean;
}

function httpError(status: number, message: string) {
  const error = new Error(message) as Error & { status: number };
  error.status = status;
  return error;
}

function isOperatorBag(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).some((k) => k.startsWith("$"))
  );
}

/** Evaluates one field condition against a stored value. */
function matchesField(stored: unknown, condition: unknown): boolean {
  if (condition === null) {
    // `null` matches a stored null and a missing field alike.
    return stored === null || stored === undefined;
  }

  if (Array.isArray(condition)) {
    return condition.some((candidate) => matchesField(stored, candidate));
  }

  if (isOperatorBag(condition)) {
    for (const [operator, operand] of Object.entries(condition)) {
      switch (operator) {
        case "$eq":
          if (!matchesField(stored, operand)) return false;
          break;
        case "$ne":
          if (matchesField(stored, operand)) return false;
          break;
        case "$in":
          if (!(operand as unknown[]).some((v) => matchesField(stored, v))) return false;
          break;
        case "$nin":
          if ((operand as unknown[]).some((v) => matchesField(stored, v))) return false;
          break;
        case "$lt":
        case "$lte":
        case "$gt":
        case "$gte": {
          // Type-bracketing: a comparison only ever matches a value of the
          // same type. A missing or null field matches no comparison at all.
          if (typeof stored !== typeof operand) return false;
          const a = stored as number;
          const b = operand as number;
          if (operator === "$lt" && !(a < b)) return false;
          if (operator === "$lte" && !(a <= b)) return false;
          if (operator === "$gt" && !(a > b)) return false;
          if (operator === "$gte" && !(a >= b)) return false;
          break;
        }
        case "$exists":
          if ((stored !== undefined) !== operand) return false;
          break;
        default:
          throw new Error(`fake entities: unsupported operator ${operator}`);
      }
    }
    return true;
  }

  return stored === condition;
}

/** Orders rows by a single field, `-field` for descending. */
function sortRows(rows: Row[], sort: string): Row[] {
  const descending = sort.startsWith("-");
  const field = sort.replace(/^[+-]/, "");

  return [...rows].sort((a, b) => {
    const left = a[field];
    const right = b[field];
    if (left === right) return 0;
    // Missing values sort last, whichever direction is asked for.
    if (left === null || left === undefined) return 1;
    if (right === null || right === undefined) return -1;
    const order = left < right ? -1 : 1;
    return descending ? -order : order;
  });
}

function matches(row: Row, query: Query): boolean {
  for (const [field, condition] of Object.entries(query)) {
    if (field === "$or") {
      if (!(condition as Query[]).some((sub) => matches(row, sub))) return false;
      continue;
    }
    if (field === "$and") {
      if (!(condition as Query[]).every((sub) => matches(row, sub))) return false;
      continue;
    }
    if (!matchesField(row[field], condition)) return false;
  }
  return true;
}

/** An in-memory entities module plus the knobs the tests need. */
export class FakeEntities {
  private readonly tables = new Map<string, Row[]>();
  private sequence = 0;

  /** Every call made, for asserting round-trip counts. */
  readonly calls: { entity: string; method: string }[] = [];

  constructor(private readonly options: FakeEntitiesOptions = {}) {}

  /** The object to hand to the store, shaped like `base44.asServiceRole.entities`. */
  get module(): Record<string, unknown> {
    return new Proxy(
      {},
      {
        get: (_target, name) => {
          if (typeof name !== "string") return undefined;
          return this.handlerFor(name);
        },
      }
    );
  }

  /** Rows currently stored for an entity, in insertion order. */
  rows(entity: string): Row[] {
    return [...(this.tables.get(entity) ?? [])];
  }

  /** Inserts a row directly, bypassing the store — including a deliberate duplicate. */
  seed(entity: string, row: Record<string, unknown>): Row {
    const table = this.tables.get(entity) ?? [];
    this.sequence += 1;
    const stored: Row = {
      id: (row.id as string) ?? `fake-${this.sequence}`,
      created_date: new Date(1_700_000_000_000 + this.sequence).toISOString(),
      ...row,
    } as Row;
    table.push(stored);
    this.tables.set(entity, table);
    return stored;
  }

  private assertPresent(entity: string) {
    if (this.options.missingEntities?.includes(entity)) {
      throw httpError(404, `entity ${entity} not found`);
    }
  }

  private handlerFor(entity: string) {
    const record = (method: string) => this.calls.push({ entity, method });

    return {
      filter: async (
        query: Query,
        sort?: string,
        limit?: number,
        skip?: number,
        fields?: string[]
      ) => {
        record("filter");
        this.assertPresent(entity);
        let found = this.rows(entity).filter((row) => matches(row, query ?? {}));
        // Sorting happens server-side in the real API, and the store relies on
        // it — a listing ordered by deadline, or paged on an immutable column,
        // is only correct if the server did the ordering.
        if (sort) found = sortRows(found, sort);
        if (skip) found = found.slice(skip);
        // Mirrors the real default: a falsy limit becomes 50, which is the
        // silent-truncation trap the store exists to avoid.
        found = found.slice(0, limit || 50);
        if (!fields) return found;
        return found.map((row) => {
          const projected: Record<string, unknown> = {};
          for (const field of [...fields, "id", "created_date"]) {
            if (field in row) projected[field] = row[field];
          }
          return projected;
        });
      },

      create: async (data: Record<string, unknown>) => {
        record("create");
        this.assertPresent(entity);
        if (this.options.failWritesOn?.includes(entity)) {
          throw httpError(503, "service unavailable");
        }
        if (this.options.duplicateKeyOn?.includes(entity)) {
          throw httpError(409, "duplicate key");
        }
        const { id, ...rest } = data;
        const seeded = this.options.honourSuppliedId
          ? { ...rest, id }
          : { ...rest };
        return this.seed(entity, seeded as Record<string, unknown>);
      },

      updateMany: async (
        query: Query,
        data: Record<string, Record<string, unknown>>
      ) => {
        record("updateMany");
        this.assertPresent(entity);
        if (this.options.failWritesOn?.includes(entity)) {
          throw httpError(503, "service unavailable");
        }
        const table = this.tables.get(entity) ?? [];
        let updated = 0;
        for (const row of table) {
          if (!matches(row, query ?? {})) continue;
          updated += 1;
          for (const [field, value] of Object.entries(data.$set ?? {})) {
            row[field] = value;
          }
          for (const field of Object.keys(data.$unset ?? {})) {
            delete row[field];
          }
          for (const [field, delta] of Object.entries(data.$inc ?? {})) {
            row[field] = ((row[field] as number) ?? 0) + (delta as number);
          }
        }
        // Note what is NOT returned: whether a row existed but failed the
        // guard. That ambiguity is the store's problem to solve.
        return { success: true, updated, has_more: false };
      },

      get: async () => {
        record("get");
        throw new Error("the store must never fetch by record id");
      },
    };
  }
}
