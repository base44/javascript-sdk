import { describe, expect, test } from "vitest";
import { KNOWN_NOTIFICATION_TYPES, planFor } from "../../src/iap/ingest/matrix.ts";
import { createHarness, notification, type Harness } from "../iap/fixtures/harness.ts";

// Certificate validity is evaluated at each payload's own signedDate, so these
// have to be real instants inside the test chain's window rather than small
// counters — a value like 2000 lands in January 1970 and fails the chain.
const T_EARLY = Date.UTC(2026, 8, 1);
const T_MID = Date.UTC(2026, 8, 3);
const T_LATE = Date.UTC(2026, 8, 5);

async function post(harness: Harness, signedPayload: string) {
  return harness.iap.handleSignedPayload(signedPayload);
}

describe("the notification matrix", () => {
  test.each([
    ["SUBSCRIBED", "INITIAL_BUY", "subscription.started", { startReason: "initial" }],
    ["SUBSCRIBED", "RESUBSCRIBE", "subscription.started", { startReason: "resubscribe" }],
    ["DID_RENEW", undefined, "subscription.renewed", { renewReason: "renewal" }],
    ["DID_RENEW", "BILLING_RECOVERY", "subscription.renewed", { renewReason: "billing_recovery" }],
    ["DID_CHANGE_RENEWAL_PREF", "UPGRADE", "subscription.plan_changed", {}],
    ["DID_CHANGE_RENEWAL_PREF", "DOWNGRADE", "subscription.plan_change_scheduled", {}],
    ["DID_CHANGE_RENEWAL_PREF", undefined, "subscription.plan_change_cancelled", {}],
    ["DID_CHANGE_RENEWAL_STATUS", "AUTO_RENEW_ENABLED", "subscription.auto_renew_changed", { autoRenewEnabled: true }],
    ["DID_CHANGE_RENEWAL_STATUS", "AUTO_RENEW_DISABLED", "subscription.auto_renew_changed", { autoRenewEnabled: false }],
    ["DID_CHANGE_RENEWAL_STATUS", undefined, "subscription.auto_renew_changed", { autoRenewEnabled: false }],
    ["DID_FAIL_TO_RENEW", "GRACE_PERIOD", "subscription.billing_issue", { inGracePeriod: true }],
    ["DID_FAIL_TO_RENEW", undefined, "subscription.billing_issue", { inGracePeriod: false }],
    ["GRACE_PERIOD_EXPIRED", undefined, "subscription.grace_period_ended", {}],
    ["EXPIRED", "VOLUNTARY", "subscription.expired", { expiryReason: "voluntary" }],
    ["EXPIRED", "BILLING_RETRY", "subscription.expired", { expiryReason: "billing" }],
    ["EXPIRED", "PRICE_INCREASE", "subscription.expired", { expiryReason: "price_increase" }],
    ["EXPIRED", "PRODUCT_NOT_FOR_SALE", "subscription.expired", { expiryReason: "product_unavailable" }],
    ["EXPIRED", undefined, "subscription.expired", { expiryReason: "other" }],
    ["OFFER_REDEEMED", "UPGRADE", "subscription.offer_redeemed", {}],
    ["OFFER_REDEEMED", undefined, "subscription.offer_redeemed", {}],
    ["PRICE_INCREASE", "PENDING", "subscription.price_increase", { priceIncreaseConsent: "pending" }],
    ["PRICE_INCREASE", "ACCEPTED", "subscription.price_increase", { priceIncreaseConsent: "accepted" }],
    ["RENEWAL_EXTENDED", undefined, "subscription.renewal_extended", {}],
    ["ONE_TIME_CHARGE", undefined, "purchase.completed", {}],
    ["REFUND", undefined, "purchase.refunded", {}],
    ["REFUND_DECLINED", undefined, "purchase.refund_declined", {}],
    ["REFUND_REVERSED", undefined, "purchase.refund_reversed", {}],
    ["REVOKE", undefined, "purchase.revoked", {}],
    ["CONSUMPTION_REQUEST", undefined, "refund.consumption_requested", {}],
    ["TEST", undefined, "apple.test_received", {}],
    ["EXTERNAL_PURCHASE_TOKEN", "CREATED", "apple.unhandled", {}],
    ["METADATA_UPDATE", undefined, "apple.unhandled", {}],
    ["MIGRATION", undefined, "apple.unhandled", {}],
    ["MIGRATE", undefined, "apple.unhandled", {}],
    ["PRICE_CHANGE", undefined, "apple.unhandled", {}],
    ["RESCIND_CONSENT", undefined, "apple.unhandled", {}],
  ])(
    "%s / %s answers Apple 200 and emits %s",
    async (notificationType, subtype, expectedEvent, detail) => {
      const harness = await createHarness();
      const result = await post(
        harness,
        await notification(harness, {
          notificationType,
          subtype,
          renewal: notificationType.startsWith("DID_") ? {} : undefined,
        })
      );

      expect(result.status).toBe(200);
      expect(result.events).toHaveLength(1);
      expect(result.events[0].type).toBe(expectedEvent);
      expect(result.events[0]).toMatchObject(detail);
      expect(result.events[0].notificationType).toBe(notificationType);
    }
  );

  test("every recognised type has a plan, and nothing falls through by accident", () => {
    for (const type of KNOWN_NOTIFICATION_TYPES) {
      expect(planFor(type).outcome).not.toBe("unknown_type");
    }
  });

  test("stores a type Apple invents later, and still answers 200", async () => {
    // Answering anything else would make Apple retry for 72 hours, and a retry
    // cannot teach this version a type it does not know.
    const harness = await createHarness();
    const result = await post(
      harness,
      await notification(harness, { notificationType: "SOMETHING_NEW_IN_2027" })
    );

    expect(result.status).toBe(200);
    expect(result.outcome).toBe("unknown_type");
    expect(result.events[0].type).toBe("apple.unknown");

    const stored = harness.fake.rows("IapNotification")[0];
    expect(stored.notificationType).toBe("SOMETHING_NEW_IN_2027");
    expect(stored.rawSignedPayload).toBeTruthy();
  });

  test("accepts both spellings of the migration type, since Apple's own pages disagree", () => {
    expect(planFor("MIGRATION").outcome).toBe("unhandled");
    expect(planFor("MIGRATE").outcome).toBe("unhandled");
  });

  test("handles a mass-extension summary, which concerns a product and no single customer", async () => {
    const harness = await createHarness();
    const result = await post(
      harness,
      await notification(harness, {
        notificationType: "RENEWAL_EXTENSION",
        subtype: "SUMMARY",
        summary: { productId: "pro_monthly", succeededCount: 10, failedCount: 1 },
      })
    );

    expect(result.status).toBe(200);
    expect(result.events[0].type).toBe("subscription.mass_extension_result");
    expect(harness.fake.rows("IapTransaction")).toHaveLength(0);
  });
});

describe("what gets stored", () => {
  test("writes the transaction and the subscription for a renewal", async () => {
    const harness = await createHarness();
    await post(
      harness,
      await notification(harness, {
        notificationType: "DID_RENEW",
        transaction: { transactionId: "tx-renewal-1", signedDate: T_MID },
        renewal: { signedDate: T_MID },
        data: { status: 1 },
      })
    );

    const transaction = harness.fake.rows("IapTransaction")[0];
    expect(transaction.transactionId).toBe("tx-renewal-1");
    expect(transaction.source).toBe("notification");
    expect(transaction.rawJws).toBeTruthy();

    const subscription = harness.fake.rows("IapSubscription")[0];
    expect(subscription.originalTransactionId).toBe("2000000000000001");
    expect(subscription.appleStatus).toBe(1);
    expect(subscription.latestTransactionJws).toBeTruthy();
    expect(subscription.latestRenewalInfoJws).toBeTruthy();
    expect(subscription.latestRenewalSignedDate).toBe(T_MID);
  });

  test("does not create a subscription row for a one-time purchase", async () => {
    const harness = await createHarness();
    await post(
      harness,
      await notification(harness, {
        notificationType: "ONE_TIME_CHARGE",
        transaction: {
          transactionId: "tx-coins-1",
          productId: "coins_100",
          type: "Consumable",
          subscriptionGroupIdentifier: undefined,
          expiresDate: undefined,
        },
      })
    );

    expect(harness.fake.rows("IapTransaction")).toHaveLength(1);
    expect(harness.fake.rows("IapSubscription")).toHaveLength(0);
  });

  test("computes an expiry for a non-renewing subscription, which Apple never expires", async () => {
    const harness = await createHarness();
    const purchasedAt = Date.UTC(2026, 8, 3);
    await post(
      harness,
      await notification(harness, {
        notificationType: "ONE_TIME_CHARGE",
        transaction: {
          transactionId: "tx-pass-1",
          productId: "season_pass",
          type: "Non-Renewing Subscription",
          purchaseDate: purchasedAt,
          expiresDate: undefined,
          subscriptionGroupIdentifier: undefined,
        },
      })
    );

    const row = harness.fake.rows("IapTransaction")[0];
    // 90 configured days after the purchase.
    expect(row.appDefinedExpiresDate).toBe(purchasedAt + 90 * 86_400_000);
  });

  test("clears the revocation when a refund is reversed, so the app can reinstate", async () => {
    const harness = await createHarness();

    await post(
      harness,
      await notification(harness, {
        notificationType: "REFUND",
        transaction: {
          transactionId: "tx-refunded",
          signedDate: T_EARLY,
          revocationDate: T_EARLY,
          revocationReason: 0,
          revocationType: "REFUND_FULL",
          revocationPercentage: 100000,
        },
      })
    );
    expect(harness.fake.rows("IapTransaction")[0].revocationDate).toBe(T_EARLY);

    await post(
      harness,
      await notification(harness, {
        notificationType: "REFUND_REVERSED",
        transaction: { transactionId: "tx-refunded", signedDate: T_LATE },
      })
    );

    const row = harness.fake.rows("IapTransaction")[0];
    // Apple omits revocationPercentage on a reversal, so leaving nullish
    // fields alone is not enough — they have to be cleared, or a paying
    // customer stays locked out.
    expect(row.revocationDate).toBeUndefined();
    expect(row.revocationPercentage).toBeUndefined();
  });

  test.each([
    ["Production", 12 * 60 * 60 * 1000],
    ["Sandbox", 5 * 60 * 1000],
  ])("gives a %s consumption request the right deadline", async (environment, window) => {
    const harness = await createHarness({ config: { testMode: true } });
    const result = await post(
      harness,
      await notification(harness, {
        notificationType: "CONSUMPTION_REQUEST",
        environment,
        transaction: { transactionId: "tx-disputed" },
        data: { consumptionRequestReason: "UNINTENDED_PURCHASE" },
      })
    );

    const row = harness.fake.rows("IapConsumptionRequest")[0];
    expect(row.deadlineAt).toBe(harness.now() + window);
    expect(row.consumptionRequestReason).toBe("UNINTENDED_PURCHASE");
    expect(result.events[0].deadlineAt).toBe(harness.now() + window);
  });

  test("fills in a consumption request's outcome from a later refund notification", async () => {
    const harness = await createHarness();
    await post(
      harness,
      await notification(harness, {
        notificationType: "CONSUMPTION_REQUEST",
        signedDate: T_EARLY,
        transaction: { transactionId: "tx-disputed" },
      })
    );
    await post(
      harness,
      await notification(harness, {
        notificationType: "REFUND",
        signedDate: T_LATE,
        transaction: { transactionId: "tx-disputed", revocationDate: T_LATE },
      })
    );

    expect(harness.fake.rows("IapConsumptionRequest")[0].outcome).toBe("REFUND");
  });

  test("attributes a notification to the user already on the subscription row", async () => {
    // A webhook has no authenticated user, and the account token Apple signs
    // in is a one-way hash, so the user is inherited from stored data.
    const harness = await createHarness();
    harness.fake.seed("IapSubscription", {
      originalTransactionId: "2000000000000001",
      appUserId: "user-42",
      latestSignedDate: T_EARLY,
      environment: "Production",
    });

    const result = await post(
      harness,
      await notification(harness, { notificationType: "DID_RENEW", renewal: {} })
    );

    expect(result.events[0].appUserId).toBe("user-42");
    expect(harness.fake.rows("IapTransaction")[0].appUserId).toBe("user-42");
  });

  test("leaves the user null for a purchase made before anyone logged in", async () => {
    const harness = await createHarness();
    const result = await post(
      harness,
      await notification(harness, { notificationType: "ONE_TIME_CHARGE" })
    );
    expect(result.events[0].appUserId).toBeNull();
  });
});

describe("duplicates and ordering", () => {
  test("recognises a repeat delivery and does not apply it twice", async () => {
    const harness = await createHarness();
    const payload = await notification(harness, {
      notificationType: "ONE_TIME_CHARGE",
      notificationUUID: "11111111-0000-4000-8000-000000000001",
    });

    const first = await post(harness, payload);
    expect(first.outcome).toBe("applied");

    const second = await post(harness, payload);
    expect(second.status).toBe(200);
    expect(second.outcome).toBe("duplicate");
    expect(second.events).toHaveLength(0);
    expect(harness.fake.rows("IapNotification")).toHaveLength(1);
  });

  test("re-applies a notification that was claimed but never applied", async () => {
    // The case that would otherwise lose money. An earlier attempt wrote the
    // raw row, then its entity writes failed and it answered 503. Apple
    // retries. A naive duplicate check would see the row and say "already
    // handled" — and the purchase data would never be stored, because Apple
    // does not retry a success.
    const harness = await createHarness();
    harness.fake.seed("IapNotification", {
      notificationUUID: "22222222-0000-4000-8000-000000000001",
      notificationType: "ONE_TIME_CHARGE",
      outcome: "error",
      attempts: 1,
    });

    const result = await post(
      harness,
      await notification(harness, {
        notificationType: "ONE_TIME_CHARGE",
        notificationUUID: "22222222-0000-4000-8000-000000000001",
        transaction: { transactionId: "tx-recovered" },
      })
    );

    expect(result.status).toBe(200);
    expect(result.outcome).toBe("applied");
    expect(harness.fake.rows("IapTransaction")[0].transactionId).toBe("tx-recovered");

    const stored = harness.fake.rows("IapNotification")[0];
    expect(stored.outcome).toBe("applied");
    expect(stored.attempts).toBe(2);
  });

  test("refuses to let an older notification undo a newer one", async () => {
    const harness = await createHarness();

    await post(
      harness,
      await notification(harness, {
        notificationType: "DID_RENEW",
        signedDate: T_LATE,
        transaction: { transactionId: "tx-new", productId: "pro_yearly", signedDate: T_LATE },
        renewal: { signedDate: T_LATE },
      })
    );

    await post(
      harness,
      await notification(harness, {
        notificationType: "DID_RENEW",
        signedDate: T_EARLY,
        transaction: { transactionId: "tx-old", productId: "pro_monthly", signedDate: T_EARLY },
        renewal: { signedDate: T_EARLY },
      })
    );

    // Both transactions are stored — they are different rows — but the
    // subscription still points at the newer one.
    expect(harness.fake.rows("IapTransaction")).toHaveLength(2);
    const subscription = harness.fake.rows("IapSubscription")[0];
    expect(subscription.productId).toBe("pro_yearly");
    expect(subscription.latestSignedDate).toBe(T_LATE);
  });
});

describe("failures", () => {
  test("answers 503 when a write fails, so Apple comes back", async () => {
    const harness = await createHarness({
      entities: { failWritesOn: ["IapTransaction"] },
    });
    const result = await post(
      harness,
      await notification(harness, { notificationType: "ONE_TIME_CHARGE" })
    );

    expect(result.status).toBe(503);
    expect(result.events).toHaveLength(0);
  });

  test("leaves the notification uncommitted after a failed write, so the retry redoes it", async () => {
    const harness = await createHarness({
      entities: { failWritesOn: ["IapTransaction"] },
    });
    await post(harness, await notification(harness, { notificationType: "ONE_TIME_CHARGE" }));

    const stored = harness.fake.rows("IapNotification")[0];
    expect(stored.outcome).toBe("error");
  });

  test("answers 401 for a payload it cannot verify", async () => {
    const harness = await createHarness();
    const result = await post(
      harness,
      await notification(harness, {
        notificationType: "ONE_TIME_CHARGE",
        jws: { tamperSignature: true },
      })
    );

    expect(result.status).toBe(401);
    expect(result.error).toMatch(/INVALID_SIGNATURE/);
    expect(harness.fake.rows("IapNotification")).toHaveLength(0);
  });

  test("answers 400 for a body Apple would never send", async () => {
    const harness = await createHarness();
    const request = new Request("https://example.com/iap", {
      method: "POST",
      body: JSON.stringify({ nothing: "useful" }),
    });
    const response = await harness.iap.handleNotification(request);
    expect(response.status).toBe(400);
  });

  test("answers 400 for a body that is not JSON at all", async () => {
    const harness = await createHarness();
    const request = new Request("https://example.com/iap", {
      method: "POST",
      body: "not json",
    });
    expect((await harness.iap.handleNotification(request)).status).toBe(400);
  });

  test("returns a real Response from the request path, with no body", async () => {
    const harness = await createHarness();
    const signedPayload = await notification(harness, {
      notificationType: "ONE_TIME_CHARGE",
    });
    const response = await harness.iap.handleNotification(
      new Request("https://example.com/iap", {
        method: "POST",
        body: JSON.stringify({ signedPayload }),
      })
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
  });

  test("a handler that throws cannot change what Apple is told", async () => {
    const harness = await createHarness();
    harness.iap.onEvent(() => {
      throw new Error("the app's own handler is broken");
    });

    const result = await post(
      harness,
      await notification(harness, { notificationType: "ONE_TIME_CHARGE" })
    );
    expect(result.status).toBe(200);
    expect(harness.fake.rows("IapTransaction")).toHaveLength(1);
  });
});

describe("setup checks", () => {
  test("reports which entities are missing", async () => {
    const harness = await createHarness({
      entities: { missingEntities: ["IapSubscription"] },
    });
    const report = await harness.iap.checkSetup();
    expect(report.ok).toBe(false);
    expect(report.missingEntities).toEqual(["IapSubscription"]);
    expect(report.checklist.length).toBeGreaterThan(0);
  });

  test("passes when all four entities exist", async () => {
    const harness = await createHarness();
    const report = await harness.iap.checkSetup();
    expect(report.ok).toBe(true);
    expect(report.missingEntities).toEqual([]);
  });

  test("never throws, so a status page can call it safely", async () => {
    const harness = await createHarness({
      entities: { failWritesOn: ["IapTransaction"] },
    });
    await expect(harness.iap.checkSetup()).resolves.toBeDefined();
  });
});
