import { beforeEach, describe, expect, test } from "vitest";
import type { EntitiesModule } from "../../src/modules/entities.types.ts";
import { createEntitiesStore } from "../../src/iap/store/entities-store.ts";
import {
  NOTIFICATION_DESCRIPTOR,
  SUBSCRIPTION_DESCRIPTOR,
  TRANSACTION_DESCRIPTOR,
} from "../../src/iap/store/descriptors.ts";
import { collapseDuplicates } from "../../src/iap/store/collapse.ts";
import {
  classifyStoreError,
  isDuplicateKeyError,
} from "../../src/iap/store/store-errors.ts";
import { FakeEntities, type FakeEntitiesOptions } from "../iap/fixtures/fake-entities.ts";

function storeWith(options: FakeEntitiesOptions = {}, mode?: "query-guard" | "natural-id") {
  const fake = new FakeEntities(options);
  const store = createEntitiesStore({
    getEntities: () => fake.module as unknown as EntitiesModule,
    mode,
  });
  return { fake, store };
}

function transactionRow(overrides: Record<string, unknown> = {}) {
  return {
    transactionId: "tx-1",
    originalTransactionId: "otx-1",
    appUserId: null,
    productId: "pro_monthly",
    environment: "Production",
    signedDate: 1000,
    rawJws: "jws-1",
    source: "notification",
    recordedAt: 500,
    updatedAt: 500,
    ...overrides,
  } as never;
}

function subscriptionRow(overrides: Record<string, unknown> = {}) {
  return {
    originalTransactionId: "otx-1",
    appUserId: "user-1",
    productId: "pro_monthly",
    latestTransactionJws: "tx-jws-1",
    latestRenewalInfoJws: null,
    latestSignedDate: 1000,
    latestRenewalSignedDate: null,
    environment: "Production",
    recordedAt: 500,
    updatedAt: 500,
    ...overrides,
  } as never;
}

describe("the cursor guard", () => {
  let fake: FakeEntities;
  let store: ReturnType<typeof createEntitiesStore>;

  beforeEach(() => {
    ({ fake, store } = storeWith());
  });

  test("applies a newer payload", async () => {
    fake.seed("IapSubscription", subscriptionRow({ latestSignedDate: 1000 }));
    const result = await store.patchWhere(
      SUBSCRIPTION_DESCRIPTOR,
      "otx-1",
      { cursorBelow: { facet: "transaction", value: 2000 } },
      { set: { productId: "pro_yearly", latestSignedDate: 2000 } as never }
    );
    expect(result.outcome).toBe("applied");
    expect(fake.rows("IapSubscription")[0].productId).toBe("pro_yearly");
  });

  test("refuses an older payload, so a late notification cannot undo a newer one", async () => {
    fake.seed("IapSubscription", subscriptionRow({ latestSignedDate: 2000 }));
    const result = await store.patchWhere(
      SUBSCRIPTION_DESCRIPTOR,
      "otx-1",
      { cursorBelow: { facet: "transaction", value: 1000 } },
      { set: { productId: "stale_write" } as never }
    );
    expect(result.outcome).toBe("stale");
    expect(fake.rows("IapSubscription")[0].productId).toBe("pro_monthly");
  });

  test("applies to a row whose cursor is null, which a bare \\$lt would skip forever", async () => {
    // MongoDB compares only within a type, so `{cursor: {$lt: n}}` does not
    // match a null or missing cursor. Without the guard's second branch a row
    // written before the column existed could never be updated again.
    fake.seed("IapSubscription", subscriptionRow({ latestRenewalSignedDate: null }));
    const result = await store.patchWhere(
      SUBSCRIPTION_DESCRIPTOR,
      "otx-1",
      { cursorBelow: { facet: "renewal", value: 1500 } },
      { set: { latestRenewalInfoJws: "renewal-jws", latestRenewalSignedDate: 1500 } as never }
    );
    expect(result.outcome).toBe("applied");
    expect(fake.rows("IapSubscription")[0].latestRenewalInfoJws).toBe("renewal-jws");
  });

  test("keeps the two subscription cursors independent, so renewal info cannot regress", async () => {
    // A device sync brings a newer transaction but no renewal info. If both
    // facets shared one cursor, that sync would advance past a later
    // notification carrying a fresh grace-period date — and a customer in a
    // billing grace period would be denied service.
    fake.seed(
      "IapSubscription",
      subscriptionRow({ latestSignedDate: 3000, latestRenewalSignedDate: 1000 })
    );

    const renewal = await store.patchWhere(
      SUBSCRIPTION_DESCRIPTOR,
      "otx-1",
      { cursorBelow: { facet: "renewal", value: 2000 } },
      {
        set: {
          latestRenewalInfoJws: "newer-renewal",
          latestRenewalSignedDate: 2000,
        } as never,
      }
    );

    // The transaction cursor is already at 3000, but the renewal cursor is
    // only at 1000, so a renewal payload from 2000 still applies.
    expect(renewal.outcome).toBe("applied");
    expect(fake.rows("IapSubscription")[0].latestRenewalInfoJws).toBe("newer-renewal");
    expect(fake.rows("IapSubscription")[0].latestSignedDate).toBe(3000);
  });

  test("tells 'no such row' apart from 'the guard rejected it'", async () => {
    // The entities API reports `updated: 0` for both, and the two need
    // different follow-ups, so the store pays one extra read to disambiguate.
    const absent = await store.patchWhere(
      SUBSCRIPTION_DESCRIPTOR,
      "otx-missing",
      { cursorBelow: { facet: "transaction", value: 2000 } },
      { set: { productId: "x" } as never }
    );
    expect(absent.outcome).toBe("absent");

    fake.seed("IapSubscription", subscriptionRow({ latestSignedDate: 5000 }));
    const stale = await store.patchWhere(
      SUBSCRIPTION_DESCRIPTOR,
      "otx-1",
      { cursorBelow: { facet: "transaction", value: 2000 } },
      { set: { productId: "x" } as never }
    );
    expect(stale.outcome).toBe("stale");
  });
});

describe("merge rules", () => {
  test("omits nullish fields, so a bare transaction cannot erase renewal info", async () => {
    const { fake, store } = storeWith();
    fake.seed(
      "IapSubscription",
      subscriptionRow({ latestRenewalInfoJws: "known-renewal", latestSignedDate: 1000 })
    );

    await store.patchWhere(
      SUBSCRIPTION_DESCRIPTOR,
      "otx-1",
      { cursorBelow: { facet: "transaction", value: 2000 } },
      {
        set: {
          latestTransactionJws: "newer-tx",
          latestSignedDate: 2000,
          latestRenewalInfoJws: null,
        } as never,
      }
    );

    const row = fake.rows("IapSubscription")[0];
    expect(row.latestTransactionJws).toBe("newer-tx");
    expect(row.latestRenewalInfoJws).toBe("known-renewal");
  });

  test("clears fields explicitly, which is how a reversed refund reinstates access", async () => {
    // Apple omits revocationPercentage entirely when a refund is reversed, so
    // the omit-nullish rule alone would leave a stale revocation behind and
    // keep a paying customer locked out.
    const { fake, store } = storeWith();
    fake.seed(
      "IapTransaction",
      transactionRow({
        revocationDate: 900,
        revocationReason: 0,
        revocationType: "REFUND_FULL",
        revocationPercentage: 100000,
      })
    );

    await store.patchWhere(
      TRANSACTION_DESCRIPTOR,
      "tx-1",
      { cursorBelow: { facet: "transaction", value: 2000 } },
      {
        set: { signedDate: 2000 } as never,
        clear: ["revocationDate", "revocationReason", "revocationType", "revocationPercentage"],
      }
    );

    const row = fake.rows("IapTransaction")[0];
    expect(row.revocationDate).toBeUndefined();
    expect(row.revocationPercentage).toBeUndefined();
  });

  test("never overwrites an insert-only column", async () => {
    const { fake, store } = storeWith();
    fake.seed("IapTransaction", transactionRow({ recordedAt: 100 }));
    await store.patchWhere(
      TRANSACTION_DESCRIPTOR,
      "tx-1",
      { cursorBelow: { facet: "transaction", value: 2000 } },
      { set: { signedDate: 2000, recordedAt: 999_999 } as never }
    );
    expect(fake.rows("IapTransaction")[0].recordedAt).toBe(100);
  });

  test("reports a patch with nothing to write as stale rather than applied", async () => {
    const { fake, store } = storeWith();
    fake.seed("IapTransaction", transactionRow());
    const result = await store.patchWhere(
      TRANSACTION_DESCRIPTOR,
      "tx-1",
      {},
      { set: { recordedAt: 1 } as never }
    );
    expect(result.outcome).toBe("stale");
    expect(result.roundTrips).toBe(0);
  });
});

describe("insert or merge", () => {
  test("inserts first for transactions, where the key is almost always new", async () => {
    const { fake, store } = storeWith();
    const result = await store.upsertNewestWins(
      TRANSACTION_DESCRIPTOR,
      "tx-1",
      { facet: "transaction", value: 1000 },
      transactionRow(),
      { set: {} as never }
    );
    expect(result.outcome).toBe("inserted");
    expect(fake.rows("IapTransaction")).toHaveLength(1);
    expect(fake.calls.map((c) => c.method)).toEqual(["filter", "create"]);
  });

  test("merges into an existing transaction when the payload is newer", async () => {
    const { fake, store } = storeWith();
    fake.seed("IapTransaction", transactionRow({ signedDate: 1000, source: "device" }));

    const result = await store.upsertNewestWins(
      TRANSACTION_DESCRIPTOR,
      "tx-1",
      { facet: "transaction", value: 2000 },
      transactionRow({ signedDate: 2000 }),
      { set: { signedDate: 2000, source: "notification" } as never }
    );

    expect(result.outcome).toBe("applied");
    expect(fake.rows("IapTransaction")).toHaveLength(1);
    expect(fake.rows("IapTransaction")[0].source).toBe("notification");
  });

  test("patches first for subscriptions, where the row usually exists", async () => {
    const { fake, store } = storeWith();
    fake.seed("IapSubscription", subscriptionRow({ latestSignedDate: 1000 }));

    const result = await store.upsertNewestWins(
      SUBSCRIPTION_DESCRIPTOR,
      "otx-1",
      { facet: "transaction", value: 2000 },
      subscriptionRow(),
      { set: { latestSignedDate: 2000 } as never }
    );

    expect(result.outcome).toBe("applied");
    expect(result.roundTrips).toBe(1);
    expect(fake.calls.map((c) => c.method)).toEqual(["updateMany"]);
  });

  test("falls back to an insert when the subscription row does not exist yet", async () => {
    const { fake, store } = storeWith();
    const result = await store.upsertNewestWins(
      SUBSCRIPTION_DESCRIPTOR,
      "otx-1",
      { facet: "transaction", value: 1000 },
      subscriptionRow(),
      { set: { latestSignedDate: 1000 } as never }
    );
    expect(result.outcome).toBe("inserted");
    expect(fake.rows("IapSubscription")).toHaveLength(1);
  });

  test("does not insert when the key is already taken", async () => {
    const { fake, store } = storeWith();
    fake.seed("IapNotification", { notificationUUID: "uuid-1", outcome: "applied" });
    const result = await store.insertIfAbsent(
      NOTIFICATION_DESCRIPTOR,
      "uuid-1",
      { notificationUUID: "uuid-1" } as never
    );
    expect(result.outcome).toBe("stale");
    expect(fake.rows("IapNotification")).toHaveLength(1);
  });
});

describe("natural-id mode", () => {
  test("uses the natural key as the record id when the backend honours it", async () => {
    const { fake, store } = storeWith({ honourSuppliedId: true }, "natural-id");
    const result = await store.insertIfAbsent(
      NOTIFICATION_DESCRIPTOR,
      "uuid-1",
      { notificationUUID: "uuid-1" } as never
    );
    expect(result.outcome).toBe("inserted");
    expect(result.roundTrips).toBe(1);
    expect(fake.rows("IapNotification")[0].id).toBe("uuid-1");
  });

  test("reads a 409 as the key being taken, not as a failure", async () => {
    const { store } = storeWith(
      { honourSuppliedId: true, duplicateKeyOn: ["IapNotification"] },
      "natural-id"
    );
    const result = await store.insertIfAbsent(
      NOTIFICATION_DESCRIPTOR,
      "uuid-1",
      { notificationUUID: "uuid-1" } as never
    );
    expect(result.outcome).toBe("stale");
  });

  test("fails loudly when the backend ignores the supplied id, rather than double-granting later", async () => {
    // The dangerous world: the backend hands back its own id, so every insert
    // looks new, de-duplication never fires, and a consumable is granted again
    // on every StoreKit re-delivery. Silently. So the store checks the id it
    // gets back and refuses to continue.
    const { store } = storeWith({ honourSuppliedId: false }, "natural-id");
    const failure = await store
      .insertIfAbsent(
        NOTIFICATION_DESCRIPTOR,
        "uuid-1",
        { notificationUUID: "uuid-1" } as never
      )
      .catch((error) => error);

    expect(failure.message).toMatch(/does not honour a caller-supplied id/);
    expect(failure.message).toMatch(/query-guard mode/);
    // And it must not be reported as transient: retrying cannot fix a
    // configuration mistake, and a retry loop would hide it.
    expect(failure).toMatchObject({ kind: "mode_mismatch", retryable: false });
  });
});

describe("reads tolerate duplicates", () => {
  test("folds two rows for one key, newest first", async () => {
    const { fake, store } = storeWith();
    fake.seed("IapTransaction", transactionRow({ signedDate: 1000, source: "device", finishedAt: 777 }));
    fake.seed("IapTransaction", transactionRow({ signedDate: 2000, source: "notification" }));

    const row = await store.getByKey(TRANSACTION_DESCRIPTOR, "tx-1");
    expect(row?.source).toBe("notification"); // newest wins
    expect(row?.finishedAt).toBe(777); // ...but the loser's extra field survives
  });

  test("keeps the oldest value for columns that record a first occurrence", async () => {
    const { fake, store } = storeWith();
    fake.seed("IapTransaction", transactionRow({ signedDate: 1000, recordedAt: 100 }));
    fake.seed("IapTransaction", transactionRow({ signedDate: 2000, recordedAt: 900 }));

    const row = await store.getByKey(TRANSACTION_DESCRIPTOR, "tx-1");
    expect(row?.recordedAt).toBe(100);
  });

  test("returns null for a key with no rows", async () => {
    const { store } = storeWith();
    expect(await store.getByKey(TRANSACTION_DESCRIPTOR, "nope")).toBeNull();
  });

  test("collapses across a batch lookup and reports one row per key", async () => {
    const { fake, store } = storeWith();
    fake.seed("IapTransaction", transactionRow({ transactionId: "tx-1", signedDate: 1000 }));
    fake.seed("IapTransaction", transactionRow({ transactionId: "tx-1", signedDate: 2000 }));
    fake.seed("IapTransaction", transactionRow({ transactionId: "tx-2", signedDate: 1000 }));

    const found = await store.getByKeys(TRANSACTION_DESCRIPTOR, ["tx-1", "tx-2", "tx-3"]);
    expect([...found.keys()].sort()).toEqual(["tx-1", "tx-2"]);
    expect(found.get("tx-1")?.signedDate).toBe(2000);
  });

  test("collapse is pure and reports how many rows it folded", () => {
    const rows = [
      { transactionId: "a", signedDate: 1, productId: "old" },
      { transactionId: "a", signedDate: 2, productId: "new" },
      { transactionId: "b", signedDate: 1, productId: "other" },
    ] as never[];
    const result = collapseDuplicates(TRANSACTION_DESCRIPTOR, rows);
    expect(result.rows).toHaveLength(2);
    expect(result.collapsed).toBe(1);
    expect(result.rows[0].productId).toBe("new");
  });
});

describe("queries never truncate silently", () => {
  test("pages past the server's default of 50 rows", async () => {
    // The entities layer drops a falsy limit and the server then returns 50.
    // In this domain that would hide an older purchase and deny someone what
    // they paid for, so the store always paginates with an explicit size.
    const { fake, store } = storeWith();
    for (let i = 0; i < 120; i += 1) {
      fake.seed(
        "IapTransaction",
        transactionRow({ transactionId: `tx-${i}`, signedDate: 1000 + i })
      );
    }

    const result = await store.query(
      TRANSACTION_DESCRIPTOR,
      { appUserId: null },
      { pageSize: 50, limit: 500 }
    );
    expect(result.rows).toHaveLength(120);
    expect(result.truncated).toBe(false);
    expect(result.roundTrips).toBe(3);
  });

  test("says so when it hits the cap instead of pretending the data ended", async () => {
    const { fake, store } = storeWith();
    for (let i = 0; i < 30; i += 1) {
      fake.seed("IapTransaction", transactionRow({ transactionId: `tx-${i}` }));
    }
    const result = await store.query(
      TRANSACTION_DESCRIPTOR,
      { appUserId: null },
      { pageSize: 10, limit: 20 }
    );
    expect(result.rows).toHaveLength(20);
    expect(result.truncated).toBe(true);
  });
});

describe("failures", () => {
  test("reports which of the four entities the app is missing", async () => {
    const { store } = storeWith({
      missingEntities: ["IapSubscription", "IapConsumptionRequest"],
    });
    const health = await store.healthcheck();
    expect(health.ok).toBe(false);
    expect(health.missing.sort()).toEqual(["IapConsumptionRequest", "IapSubscription"]);
  });

  test("passes a healthcheck when all four exist", async () => {
    const { store } = storeWith();
    expect(await store.healthcheck()).toEqual({ ok: true, missing: [] });
  });

  test("raises a write failure as a retryable store error", async () => {
    const { store } = storeWith({ failWritesOn: ["IapTransaction"] });
    const failure = await store
      .insertIfAbsent(TRANSACTION_DESCRIPTOR, "tx-1", transactionRow())
      .catch((error) => error);
    expect(failure).toMatchObject({ code: "IAP_WRITE_FAILED", kind: "transient", retryable: true });
  });
});

describe("error classification", () => {
  test.each([
    [{ status: 409 }, true],
    [{ status: 400, code: "DUPLICATE_KEY" }, true],
    [{ status: 400, message: "E11000 duplicate key error" }, true],
    [{ status: 400, data: { message: "record already exists" } }, true],
  ])("reads %o as a duplicate key", (error, expected) => {
    expect(isDuplicateKeyError(error)).toBe(expected);
  });

  test.each([
    [{ status: 500 }],
    [{ status: 400, message: "validation failed" }],
    [{ status: undefined }],
    [{ status: 404 }],
  ])("does not read %o as a duplicate key", (error) => {
    // Reading a transient failure as "already exists" would make the webhook
    // answer Apple 200 with nothing stored, and Apple never retries a 200.
    expect(isDuplicateKeyError(error)).toBe(false);
  });

  test.each([
    [{ status: undefined }, "transient", true],
    [{ status: 500 }, "transient", true],
    [{ status: 503 }, "transient", true],
    [{ status: 429 }, "transient", true],
    [{ status: 404 }, "entity_missing", false],
    [{ status: 401 }, "permission", false],
    [{ status: 403 }, "permission", false],
    [{ status: 413 }, "row_too_large", false],
    [{ status: 422 }, "invalid", false],
  ])("classifies %o as %s", (error, kind, retryable) => {
    expect(classifyStoreError(error)).toMatchObject({ kind, retryable });
  });

  test("treats a missing status as retryable, since a network error leaves it undefined", () => {
    expect(classifyStoreError(new Error("socket hang up"))).toMatchObject({
      kind: "transient",
      retryable: true,
    });
  });
});
