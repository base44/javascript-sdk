import { describe, expect, test } from "vitest";
import { appAccountTokenFor } from "../../src/iap/account-token.ts";
import { signJws } from "../iap/fixtures/sign-jws.ts";
import {
  createHarness,
  renewalPayload,
  transactionPayload,
  type Harness,
} from "../iap/fixtures/harness.ts";

const NOW = Date.UTC(2026, 8, 3, 12, 0, 0);
const HOUR = 3_600_000;

async function tokenFor(harness: Harness, overrides: Record<string, unknown> = {}) {
  return signJws(harness.chain, transactionPayload({ signedDate: NOW, ...overrides }));
}

describe("recordTransaction", () => {
  test("stores a purchase and reports it as new", async () => {
    const harness = await createHarness({ startAt: NOW });
    const result = await harness.iap.recordTransaction(
      await tokenFor(harness, {
        transactionId: "tx-coins-1",
        productId: "coins_100",
        type: "Consumable",
        expiresDate: undefined,
        subscriptionGroupIdentifier: undefined,
      })
    );

    expect(result).toMatchObject({
      recorded: true,
      transactionId: "tx-coins-1",
      duplicate: false,
    });
    expect(result.decoded.productId).toBe("coins_100");

    const row = harness.fake.rows("IapTransaction")[0];
    expect(row.source).toBe("device");
    expect(row.rawJws).toBeTruthy();
  });

  test("reports a repeat as a duplicate, which is the double-delivery guard", async () => {
    // StoreKit re-delivers an unfinished transaction at every launch, so a
    // consumable must only be granted when duplicate is false.
    const harness = await createHarness({ startAt: NOW });
    const jws = await tokenFor(harness, { transactionId: "tx-coins-1" });

    expect((await harness.iap.recordTransaction(jws)).duplicate).toBe(false);
    expect((await harness.iap.recordTransaction(jws)).duplicate).toBe(true);
    expect(harness.fake.rows("IapTransaction")).toHaveLength(1);
  });

  test("emits a purchase event only the first time", async () => {
    const harness = await createHarness({ startAt: NOW });
    const jws = await tokenFor(harness, {
      transactionId: "tx-coins-1",
      productId: "coins_100",
      type: "Consumable",
    });

    await harness.iap.recordTransaction(jws);
    await harness.iap.recordTransaction(jws);

    expect(harness.events.map((event) => event.type)).toEqual(["purchase.completed"]);
  });

  test("emits a subscription event for a subscription", async () => {
    const harness = await createHarness({ startAt: NOW });
    await harness.iap.recordTransaction(await tokenFor(harness));
    expect(harness.events[0].type).toBe("subscription.started");
    expect(harness.fake.rows("IapSubscription")).toHaveLength(1);
  });

  test("attributes the purchase to the user who made the request", async () => {
    const harness = await createHarness({ startAt: NOW });
    const result = await harness.iap.recordTransaction(
      await tokenFor(harness, {
        appAccountToken: appAccountTokenFor("user-1"),
      }),
      { appUserId: "user-1" }
    );

    expect(result.recorded).toBe(true);
    expect(harness.fake.rows("IapTransaction")[0].appUserId).toBe("user-1");
  });

  test("rejects a token whose account token belongs to someone else", async () => {
    // Otherwise a customer could replay another customer's signed token and
    // have the purchase credited to themselves.
    const harness = await createHarness({ startAt: NOW });
    const jws = await tokenFor(harness, {
      appAccountToken: appAccountTokenFor("user-1"),
    });

    await expect(
      harness.iap.recordTransaction(jws, { appUserId: "user-2" })
    ).rejects.toMatchObject({ code: "INVALID_APP_IDENTIFIER" });
    expect(harness.fake.rows("IapTransaction")).toHaveLength(0);
  });

  test("accepts a token with no account token at all, leaving it unattributed", async () => {
    // A purchase made before the customer logged in. A later sync attaches them.
    const harness = await createHarness({ startAt: NOW });
    const result = await harness.iap.recordTransaction(
      await tokenFor(harness, { appAccountToken: undefined }),
      { appUserId: "user-1" }
    );
    expect(result.recorded).toBe(true);
    expect(harness.fake.rows("IapTransaction")[0].appUserId).toBe("user-1");
  });

  test("throws when the write fails, so the app does not finish the transaction", async () => {
    // The load-bearing behaviour: if this throws, the app must not call
    // finish(), and StoreKit re-delivers the purchase at the next launch.
    const harness = await createHarness({
      startAt: NOW,
      entities: { failWritesOn: ["IapTransaction"] },
    });
    await expect(
      harness.iap.recordTransaction(await tokenFor(harness))
    ).rejects.toMatchObject({ code: "IAP_WRITE_FAILED" });
  });

  test("rejects an unverifiable token before touching storage", async () => {
    const harness = await createHarness({ startAt: NOW });
    const jws = await signJws(harness.chain, transactionPayload({ signedDate: NOW }), {
      tamperSignature: true,
    });
    await expect(harness.iap.recordTransaction(jws)).rejects.toMatchObject({
      code: "INVALID_SIGNATURE",
    });
    expect(harness.fake.rows("IapTransaction")).toHaveLength(0);
  });
});

describe("syncEntitlements", () => {
  test("stores everything the device knows and says what may be finished", async () => {
    const harness = await createHarness({ startAt: NOW });

    const result = await harness.iap.syncEntitlements(
      {
        entitlements: [
          await tokenFor(harness, {
            transactionId: "tx-sub",
            appAccountToken: appAccountTokenFor("user-1"),
          }),
        ],
        unfinished: [
          await tokenFor(harness, {
            transactionId: "tx-coins",
            productId: "coins_100",
            type: "Consumable",
            expiresDate: undefined,
            subscriptionGroupIdentifier: undefined,
            appAccountToken: appAccountTokenFor("user-1"),
          }),
        ],
        environment: "Production",
      },
      { appUserId: "user-1" }
    );

    expect(result.recordedTransactionIds.sort()).toEqual(["tx-coins", "tx-sub"]);
    expect(result.skipped).toBe(0);
    expect(harness.fake.rows("IapTransaction")).toHaveLength(2);
  });

  test("stores a status pair, so renewal information reaches the server at all", async () => {
    // Current entitlements carry a transaction but no renewal information, and
    // renewal information is where the grace period and auto-renew flag live.
    const harness = await createHarness({ startAt: NOW });

    await harness.iap.syncEntitlements(
      {
        statuses: [
          {
            transactionJws: await tokenFor(harness, { transactionId: "tx-sub" }),
            renewalInfoJws: await signJws(
              harness.chain,
              renewalPayload({
                signedDate: NOW,
                gracePeriodExpiresDate: NOW + 16 * 24 * HOUR,
              })
            ),
          },
        ],
      },
      { appUserId: "user-1" }
    );

    const subscription = harness.fake.rows("IapSubscription")[0];
    expect(subscription.latestRenewalInfoJws).toBeTruthy();
    expect(subscription.latestRenewalSignedDate).toBe(NOW);
  });

  test("skips one bad token without failing the rest", async () => {
    const harness = await createHarness({ startAt: NOW });
    const result = await harness.iap.syncEntitlements(
      {
        entitlements: [
          "not-a-token",
          await tokenFor(harness, { transactionId: "tx-good" }),
        ],
      },
      { appUserId: "user-1" }
    );

    expect(result.skipped).toBe(1);
    expect(result.recordedTransactionIds).toEqual(["tx-good"]);
  });

  test("skips a token belonging to another user", async () => {
    const harness = await createHarness({ startAt: NOW });
    const result = await harness.iap.syncEntitlements(
      {
        entitlements: [
          await tokenFor(harness, {
            transactionId: "tx-someone-else",
            appAccountToken: appAccountTokenFor("user-2"),
          }),
        ],
      },
      { appUserId: "user-1" }
    );

    expect(result.skipped).toBe(1);
    expect(result.recordedTransactionIds).toEqual([]);
  });

  test("omits a transaction it could not store, so the device keeps retrying it", async () => {
    const harness = await createHarness({
      startAt: NOW,
      entities: { failWritesOn: ["IapTransaction"] },
    });
    const result = await harness.iap.syncEntitlements(
      { entitlements: [await tokenFor(harness, { transactionId: "tx-1" })] },
      { appUserId: "user-1" }
    );

    expect(result.recordedTransactionIds).toEqual([]);
    expect(result.skipped).toBe(1);
  });

  test("returns the server's own view so the app can reconcile its UI", async () => {
    const harness = await createHarness({ startAt: NOW });
    await harness.iap.syncEntitlements(
      {
        entitlements: [
          await tokenFor(harness, {
            transactionId: "tx-sub",
            expiresDate: NOW + 30 * 24 * HOUR,
          }),
        ],
      },
      { appUserId: "user-1" }
    );

    const result = await harness.iap.syncEntitlements({}, { appUserId: "user-1" });
    expect(result.snapshot.subscriptions).toHaveLength(1);
    expect(result.snapshot.subscriptions[0].entitled).toBe(true);
    expect(result.snapshot.asOf).toBe(NOW);
  });

  test("counts a device entitlement the server does not agree is live", async () => {
    // Persistently above zero means Apple's notifications are going missing.
    const harness = await createHarness({ startAt: NOW });
    const result = await harness.iap.syncEntitlements(
      {
        entitlements: [
          await tokenFor(harness, {
            transactionId: "tx-lapsed",
            expiresDate: NOW - HOUR,
          }),
        ],
      },
      { appUserId: "user-1" }
    );

    expect(result.mismatches).toBe(1);
    expect(harness.events.at(-1)).toMatchObject({
      type: "sync.applied",
      mismatches: 1,
    });
  });

  test("reports no mismatch when the two sides agree", async () => {
    const harness = await createHarness({ startAt: NOW });
    const result = await harness.iap.syncEntitlements(
      {
        entitlements: [
          await tokenFor(harness, {
            transactionId: "tx-live",
            expiresDate: NOW + 30 * 24 * HOUR,
          }),
        ],
      },
      { appUserId: "user-1" }
    );
    expect(result.mismatches).toBe(0);
  });

  test("is idempotent, so calling it every launch changes nothing", async () => {
    const harness = await createHarness({ startAt: NOW });
    const payload = {
      entitlements: [await tokenFor(harness, { transactionId: "tx-sub" })],
    };

    await harness.iap.syncEntitlements(payload, { appUserId: "user-1" });
    await harness.iap.syncEntitlements(payload, { appUserId: "user-1" });

    expect(harness.fake.rows("IapTransaction")).toHaveLength(1);
    expect(harness.fake.rows("IapSubscription")).toHaveLength(1);
  });

  test("handles an empty payload without complaint", async () => {
    const harness = await createHarness({ startAt: NOW });
    const result = await harness.iap.syncEntitlements({}, { appUserId: "user-1" });
    expect(result).toMatchObject({
      recordedTransactionIds: [],
      mismatches: 0,
      skipped: 0,
    });
  });
});

describe("a device transaction cannot regress renewal information", () => {
  test("keeps a grace-period date a notification supplied", async () => {
    // The exact regression the two cursors exist to prevent. A notification
    // brings a grace-period date; a later device sync brings a newer
    // transaction and no renewal information. With one shared cursor the sync
    // would advance past the notification and the grace period would vanish —
    // denying service to a customer Apple is still trying to bill.
    const harness = await createHarness({ startAt: NOW });

    harness.fake.seed("IapSubscription", {
      originalTransactionId: "2000000000000001",
      appUserId: "user-1",
      latestTransactionJws: "old-tx",
      latestRenewalInfoJws: "renewal-with-grace",
      latestSignedDate: NOW - 2 * HOUR,
      latestRenewalSignedDate: NOW - HOUR,
      environment: "Production",
    });

    await harness.iap.syncEntitlements(
      { entitlements: [await tokenFor(harness, { signedDate: NOW })] },
      { appUserId: "user-1" }
    );

    const row = harness.fake.rows("IapSubscription")[0];
    expect(row.latestSignedDate).toBe(NOW);
    expect(row.latestRenewalInfoJws).toBe("renewal-with-grace");
    expect(row.latestRenewalSignedDate).toBe(NOW - HOUR);
  });
});
