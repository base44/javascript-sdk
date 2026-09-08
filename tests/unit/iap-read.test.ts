import { describe, expect, test } from "vitest";
import {
  deriveStatus,
  deriveSubscriptionState,
  statusDisagrees,
} from "../../src/iap/read/derive.ts";
import { createHarness, notification } from "../iap/fixtures/harness.ts";

const NOW = Date.UTC(2026, 8, 3, 12, 0, 0);
const HOUR = 3_600_000;

describe("the five derivation rules", () => {
  test("1. a revoked purchase is never entitled, even inside a paid period", () => {
    // Apple's rule is absolute: never deliver content for a transaction
    // carrying a revocation date. It outranks an expiry still in the future.
    const state = deriveSubscriptionState({
      originalTransactionId: "otx-1",
      transaction: {
        expiresDate: NOW + 30 * 24 * HOUR,
        revocationDate: NOW - HOUR,
        revocationReason: 1,
        revocationType: "REFUND_FULL",
        revocationPercentage: 100000,
      },
      renewal: undefined,
      environment: "Production",
      appleStatus: 5,
      now: NOW,
    });

    expect(state.status).toBe("revoked");
    expect(state.entitled).toBe(false);
    expect(state.revocation).toEqual({
      date: NOW - HOUR,
      reason: 1,
      type: "REFUND_FULL",
      percentage: 100000,
    });
  });

  test("2. an unexpired subscription is active", () => {
    const state = deriveSubscriptionState({
      originalTransactionId: "otx-1",
      transaction: { expiresDate: NOW + HOUR },
      renewal: { autoRenewStatus: 1 },
      environment: "Production",
      appleStatus: 1,
      now: NOW,
    });
    expect(state.status).toBe("active");
    expect(state.entitled).toBe(true);
    expect(state.willRenew).toBe(true);
  });

  test("3. an expired subscription in a grace period IS entitled", () => {
    // The rule most easily got wrong. The payment failed, but Apple's
    // requirement is explicit: provide full service throughout the grace
    // period.
    const state = deriveSubscriptionState({
      originalTransactionId: "otx-1",
      transaction: { expiresDate: NOW - HOUR },
      renewal: { gracePeriodExpiresDate: NOW + 16 * 24 * HOUR, isInBillingRetryPeriod: true },
      environment: "Production",
      appleStatus: 4,
      now: NOW,
    });
    expect(state.status).toBe("grace_period");
    expect(state.entitled).toBe(true);
    expect(state.gracePeriodExpiresAt).toBe(NOW + 16 * 24 * HOUR);
  });

  test("4. billing retry without a grace period is NOT entitled", () => {
    const state = deriveSubscriptionState({
      originalTransactionId: "otx-1",
      transaction: { expiresDate: NOW - HOUR },
      renewal: { isInBillingRetryPeriod: true },
      environment: "Production",
      appleStatus: 3,
      now: NOW,
    });
    expect(state.status).toBe("billing_retry");
    expect(state.entitled).toBe(false);
  });

  test("5. anything else has expired, with the reason Apple gave", () => {
    const state = deriveSubscriptionState({
      originalTransactionId: "otx-1",
      transaction: { expiresDate: NOW - HOUR },
      renewal: { expirationIntent: 2, autoRenewStatus: 0 },
      environment: "Production",
      appleStatus: 2,
      now: NOW,
    });
    expect(state.status).toBe("expired");
    expect(state.entitled).toBe(false);
    expect(state.expirationReason).toBe("billing_error");
    expect(state.willRenew).toBe(false);
  });

  test.each([
    [1, "cancelled"],
    [2, "billing_error"],
    [3, "price_increase_declined"],
    [4, "product_unavailable"],
    [5, "other"],
    [99, "other"],
  ])("reads expiration intent %i as %s", (intent, reason) => {
    const state = deriveSubscriptionState({
      originalTransactionId: "otx-1",
      transaction: { expiresDate: NOW - HOUR },
      renewal: { expirationIntent: intent },
      environment: "Production",
      appleStatus: null,
      now: NOW,
    });
    expect(state.expirationReason).toBe(reason);
  });

  test("a grace period that has itself ended no longer entitles", () => {
    expect(
      deriveStatus(
        { expiresDate: NOW - 2 * HOUR },
        { gracePeriodExpiresDate: NOW - HOUR, isInBillingRetryPeriod: true },
        NOW
      )
    ).toBe("billing_retry");
  });

  test("a subscription with no expiry at all reads as expired, which is the safe direction", () => {
    expect(deriveStatus({}, undefined, NOW)).toBe("expired");
    expect(deriveStatus(undefined, undefined, NOW)).toBe("expired");
  });

  test("carries the details a customer-facing screen needs", () => {
    const state = deriveSubscriptionState({
      originalTransactionId: "otx-1",
      transaction: {
        expiresDate: NOW + HOUR,
        productId: "pro_monthly",
        subscriptionGroupIdentifier: "21234567",
        inAppOwnershipType: "FAMILY_SHARED",
        offerType: 2,
        offerIdentifier: "winter_promo",
        offerDiscountType: "PAY_AS_YOU_GO",
        signedDate: NOW,
      },
      renewal: {
        autoRenewProductId: "pro_yearly",
        autoRenewStatus: 1,
        priceIncreaseStatus: 0,
        eligibleWinBackOfferIds: ["comeback_20"],
      },
      environment: "Production",
      appleStatus: 1,
      now: NOW,
    });

    expect(state).toMatchObject({
      productId: "pro_monthly",
      subscriptionGroupIdentifier: "21234567",
      isFamilyShared: true,
      autoRenewProductId: "pro_yearly",
      priceIncreaseConsentPending: true,
      eligibleWinBackOfferIds: ["comeback_20"],
      offer: { type: 2, identifier: "winter_promo", discountType: "PAY_AS_YOU_GO" },
      signedDate: NOW,
    });
  });

  test("notices when the derived status disagrees with Apple's own code", () => {
    expect(statusDisagrees("active", 1)).toBe(false);
    expect(statusDisagrees("grace_period", 4)).toBe(false);
    expect(statusDisagrees("billing_retry", 3)).toBe(false);
    expect(statusDisagrees("expired", 2)).toBe(false);
    expect(statusDisagrees("revoked", 5)).toBe(false);
    expect(statusDisagrees("active", 2)).toBe(true);
    // No code from Apple is not a disagreement.
    expect(statusDisagrees("active", null)).toBe(false);
  });
});

describe("entitlement checks, end to end", () => {
  /** Stores a subscription by pushing a real signed notification through. */
  async function storeSubscription(
    harness: Awaited<ReturnType<typeof createHarness>>,
    options: {
      readonly appUserId?: string;
      readonly productId?: string;
      readonly expiresDate?: number;
      readonly environment?: string;
      readonly renewal?: Record<string, unknown>;
      readonly transaction?: Record<string, unknown>;
    } = {}
  ) {
    if (options.appUserId) {
      harness.fake.seed("IapSubscription", {
        originalTransactionId: "2000000000000001",
        appUserId: options.appUserId,
        latestSignedDate: Date.UTC(2026, 8, 1),
        environment: options.environment ?? "Production",
      });
    }

    const result = await harness.iap.handleSignedPayload(
      await notification(harness, {
        notificationType: "SUBSCRIBED",
        subtype: "INITIAL_BUY",
        environment: options.environment,
        transaction: {
          productId: options.productId ?? "pro_monthly",
          expiresDate: options.expiresDate ?? NOW + 30 * 24 * HOUR,
          ...options.transaction,
        },
        renewal: { autoRenewStatus: 1, ...options.renewal },
      })
    );
    expect(result.status).toBe(200);
  }

  test("says yes for a live subscription", async () => {
    const harness = await createHarness({ startAt: NOW });
    await storeSubscription(harness, { appUserId: "user-1" });
    expect(await harness.iap.hasActiveSubscription("user-1")).toBe(true);
  });

  test("says no for a lapsed one, without needing an EXPIRED notification", async () => {
    // This is why status is derived rather than stored: the subscription
    // simply runs out, whether or not Apple's notification ever arrived.
    const harness = await createHarness({ startAt: NOW });
    await storeSubscription(harness, {
      appUserId: "user-1",
      expiresDate: NOW - HOUR,
    });
    expect(await harness.iap.hasActiveSubscription("user-1")).toBe(false);
  });

  test("says yes during a billing grace period", async () => {
    const harness = await createHarness({ startAt: NOW });
    await storeSubscription(harness, {
      appUserId: "user-1",
      expiresDate: NOW - HOUR,
      renewal: { gracePeriodExpiresDate: NOW + 16 * 24 * HOUR },
    });
    expect(await harness.iap.hasActiveSubscription("user-1")).toBe(true);
  });

  test("says no for a user with nothing at all", async () => {
    const harness = await createHarness({ startAt: NOW });
    expect(await harness.iap.hasActiveSubscription("stranger")).toBe(false);
  });

  test("says no for an empty user id rather than matching every unattributed row", async () => {
    const harness = await createHarness({ startAt: NOW });
    expect(await harness.iap.hasActiveSubscription("")).toBe(false);
  });

  test("narrows to the products asked for", async () => {
    const harness = await createHarness({ startAt: NOW });
    await storeSubscription(harness, { appUserId: "user-1", productId: "pro_monthly" });

    expect(
      await harness.iap.hasActiveSubscription("user-1", { productIds: ["pro_monthly"] })
    ).toBe(true);
    expect(
      await harness.iap.hasActiveSubscription("user-1", { productIds: ["pro_yearly"] })
    ).toBe(false);
  });

  test("ignores a sandbox purchase unless test mode is on", async () => {
    // So a live app cannot be unlocked with a sandbox purchase.
    const strict = await createHarness({ startAt: NOW, config: { testMode: false } });
    // A sandbox token is refused outright when test mode is off, so the
    // notification itself fails — which is the earliest possible rejection.
    const rejected = await strict.iap.handleSignedPayload(
      await notification(strict, {
        notificationType: "SUBSCRIBED",
        environment: "Sandbox",
        renewal: {},
      })
    );
    expect(rejected.status).toBe(401);

    const testing = await createHarness({ startAt: NOW, config: { testMode: true } });
    await storeSubscription(testing, { appUserId: "user-1", environment: "Sandbox" });
    expect(await testing.iap.hasActiveSubscription("user-1")).toBe(true);
  });

  test("never throws when storage is broken, and denies instead", async () => {
    const harness = await createHarness({
      startAt: NOW,
      entities: { missingEntities: ["IapSubscription"] },
    });
    await expect(harness.iap.hasActiveSubscription("user-1")).resolves.toBe(false);
  });

  test("denies a row whose stored token no longer verifies, without failing the call", async () => {
    const harness = await createHarness({ startAt: NOW });
    harness.fake.seed("IapSubscription", {
      originalTransactionId: "otx-corrupt",
      appUserId: "user-1",
      latestTransactionJws: "not-a-real-token",
      latestSignedDate: NOW,
      environment: "Production",
    });

    const states = await harness.iap.getSubscriptionState("user-1");
    expect(states).toHaveLength(1);
    expect(states[0].entitled).toBe(false);
    expect(await harness.iap.hasActiveSubscription("user-1")).toBe(false);
  });
});

describe("entitlements", () => {
  test("lists what a user owns, and never lists consumables", async () => {
    const harness = await createHarness({ startAt: NOW });

    await harness.iap.handleSignedPayload(
      await notification(harness, {
        notificationType: "ONE_TIME_CHARGE",
        transaction: {
          transactionId: "tx-lifetime",
          productId: "lifetime",
          type: "Non-Consumable",
          subscriptionGroupIdentifier: undefined,
          expiresDate: undefined,
        },
      })
    );
    await harness.iap.handleSignedPayload(
      await notification(harness, {
        notificationType: "ONE_TIME_CHARGE",
        transaction: {
          transactionId: "tx-coins",
          productId: "coins_100",
          type: "Consumable",
          subscriptionGroupIdentifier: undefined,
          expiresDate: undefined,
        },
      })
    );

    // The webhook could not attribute either purchase, so attach a user the
    // way a later device sync would.
    for (const row of harness.fake.rows("IapTransaction")) {
      row.appUserId = "user-1";
    }

    const owned = await harness.iap.getEntitlements("user-1");
    expect(owned.nonConsumables.map((item) => item.productId)).toEqual(["lifetime"]);
    // Apple leaves consumables out of current entitlements, and so does this.
    expect(JSON.stringify(owned)).not.toContain("coins_100");
    expect(owned.asOf).toBe(NOW);
  });

  test("expires a non-renewing subscription from the configured duration", async () => {
    const harness = await createHarness({ startAt: NOW });
    const purchasedAt = NOW - 100 * 24 * HOUR; // 100 days ago, pass lasts 90

    await harness.iap.handleSignedPayload(
      await notification(harness, {
        notificationType: "ONE_TIME_CHARGE",
        transaction: {
          transactionId: "tx-pass",
          productId: "season_pass",
          type: "Non-Renewing Subscription",
          purchaseDate: purchasedAt,
          expiresDate: undefined,
          subscriptionGroupIdentifier: undefined,
        },
      })
    );
    for (const row of harness.fake.rows("IapTransaction")) {
      row.appUserId = "user-1";
    }

    const owned = await harness.iap.getEntitlements("user-1");
    const [pass] = owned.nonRenewingSubscriptions;
    expect(pass.productId).toBe("season_pass");
    expect(pass.expiresAt).toBe(purchasedAt + 90 * 24 * HOUR);
    // Apple never expires these, so only the configured duration says so.
    expect(pass.active).toBe(false);
  });
});

describe("listings", () => {
  test("finds a stored purchase by transaction id", async () => {
    const harness = await createHarness({ startAt: NOW });
    await harness.iap.handleSignedPayload(
      await notification(harness, {
        notificationType: "ONE_TIME_CHARGE",
        transaction: { transactionId: "tx-lookup", productId: "lifetime" },
      })
    );

    const purchase = await harness.iap.getPurchase("tx-lookup");
    expect(purchase?.productId).toBe("lifetime");
    expect(await harness.iap.getPurchase("nope")).toBeNull();
  });

  test("lists only refunded purchases, with how much was refunded", async () => {
    const harness = await createHarness({ startAt: NOW });
    harness.fake.seed("IapTransaction", {
      transactionId: "tx-kept",
      appUserId: "user-1",
      productId: "coins_100",
      purchaseDate: NOW - HOUR,
      revocationDate: null,
      environment: "Production",
      signedDate: NOW,
    });
    harness.fake.seed("IapTransaction", {
      transactionId: "tx-refunded",
      appUserId: "user-1",
      productId: "coins_100",
      purchaseDate: NOW - 2 * HOUR,
      revocationDate: NOW,
      revocationPercentage: 50000,
      environment: "Production",
      signedDate: NOW,
    });

    const refunds = await harness.iap.listRefunds("user-1");
    expect(refunds.map((row) => row.transactionId)).toEqual(["tx-refunded"]);
    expect(refunds[0].revocationPercentage).toBe(50000);
  });

  test("filters a transaction listing by product, date and refund state", async () => {
    const harness = await createHarness({ startAt: NOW });
    for (const [id, productId, purchaseDate, revocationDate] of [
      ["tx-1", "coins_100", NOW - 10 * HOUR, null],
      ["tx-2", "coins_100", NOW - 2 * HOUR, null],
      ["tx-3", "lifetime", NOW - HOUR, null],
      ["tx-4", "coins_100", NOW - HOUR, NOW],
    ] as const) {
      harness.fake.seed("IapTransaction", {
        transactionId: id,
        appUserId: "user-1",
        productId,
        purchaseDate,
        revocationDate,
        environment: "Production",
        signedDate: NOW,
      });
    }

    const recentCoins = await harness.iap.listTransactions("user-1", {
      productId: "coins_100",
      since: NOW - 5 * HOUR,
      revoked: false,
    });
    expect(recentCoins.map((row) => row.transactionId)).toEqual(["tx-2"]);
  });

  test("lists open consumption requests by deadline, and drops expired ones", async () => {
    const harness = await createHarness({ startAt: NOW });
    harness.fake.seed("IapConsumptionRequest", {
      transactionId: "tx-late",
      deadlineAt: NOW + 10 * 60_000,
      respondedAt: null,
      environment: "Production",
    });
    harness.fake.seed("IapConsumptionRequest", {
      transactionId: "tx-soon",
      deadlineAt: NOW + 60_000,
      respondedAt: null,
      environment: "Production",
    });
    harness.fake.seed("IapConsumptionRequest", {
      transactionId: "tx-missed",
      deadlineAt: NOW - 60_000,
      respondedAt: null,
      environment: "Production",
    });
    harness.fake.seed("IapConsumptionRequest", {
      transactionId: "tx-answered",
      deadlineAt: NOW + 60_000,
      respondedAt: NOW,
      environment: "Production",
    });

    const pending = await harness.iap.listPendingConsumptionRequests();
    expect(pending.map((row) => row.transactionId)).toEqual(["tx-soon", "tx-late"]);
  });
});
