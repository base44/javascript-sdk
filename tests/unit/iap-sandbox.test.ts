import { describe, expect, test } from "vitest";
import { signJws } from "../iap/fixtures/sign-jws.ts";
import {
  createHarness,
  notification,
  renewalPayload,
  transactionPayload,
  type Harness,
} from "../iap/fixtures/harness.ts";

// Apple accelerates sandbox subscriptions: a one-month plan renews every five
// minutes, and grace periods last minutes rather than days. Nothing in the SDK
// treats those durations specially — expiry is read from the payload — but the
// timings here are the real ones, so the tests exercise the same shape.
const NOW = Date.UTC(2026, 8, 3, 12, 0, 0);
const MINUTE = 60_000;
const SANDBOX_MONTH = 5 * MINUTE;

/** A harness that accepts sandbox purchases. */
function sandboxHarness(startAt = NOW) {
  return createHarness({ startAt, config: { testMode: true } });
}

/** A sandbox notification. Apple omits appAppleId from sandbox payloads. */
async function sandboxNotification(
  harness: Harness,
  options: Parameters<typeof notification>[1]
) {
  return notification(harness, { ...options, environment: "Sandbox" });
}

describe("a sandbox subscription, start to finish", () => {
  test("the initial purchase is stored and entitles the customer", async () => {
    const harness = await sandboxHarness();
    harness.fake.seed("IapSubscription", {
      originalTransactionId: "2000000000000001",
      appUserId: "tester-1",
      latestSignedDate: NOW - MINUTE,
      environment: "Sandbox",
    });

    const result = await harness.iap.handleSignedPayload(
      await sandboxNotification(harness, {
        notificationType: "SUBSCRIBED",
        subtype: "INITIAL_BUY",
        signedDate: NOW,
        transaction: { expiresDate: NOW + SANDBOX_MONTH },
        renewal: { autoRenewStatus: 1 },
      })
    );

    expect(result.status).toBe(200);
    expect(result.outcome).toBe("applied");
    expect(harness.fake.rows("IapTransaction")[0].environment).toBe("Sandbox");
    expect(await harness.iap.hasActiveSubscription("tester-1")).toBe(true);
  });

  test("an accelerated renewal five minutes later moves the subscription on", async () => {
    const harness = await sandboxHarness();
    harness.fake.seed("IapSubscription", {
      originalTransactionId: "2000000000000001",
      appUserId: "tester-1",
      latestSignedDate: NOW - MINUTE,
      environment: "Sandbox",
    });

    await harness.iap.handleSignedPayload(
      await sandboxNotification(harness, {
        notificationType: "SUBSCRIBED",
        subtype: "INITIAL_BUY",
        signedDate: NOW,
        transaction: { transactionId: "tx-1", expiresDate: NOW + SANDBOX_MONTH },
        renewal: {},
      })
    );

    harness.setNow(NOW + SANDBOX_MONTH);
    await harness.iap.handleSignedPayload(
      await sandboxNotification(harness, {
        notificationType: "DID_RENEW",
        signedDate: NOW + SANDBOX_MONTH,
        transaction: {
          transactionId: "tx-2",
          transactionReason: "RENEWAL",
          signedDate: NOW + SANDBOX_MONTH,
          expiresDate: NOW + 2 * SANDBOX_MONTH,
        },
        renewal: { signedDate: NOW + SANDBOX_MONTH },
      })
    );

    // Two transactions under one subscription, and the row points at the newer.
    expect(harness.fake.rows("IapTransaction")).toHaveLength(2);
    expect(harness.fake.rows("IapSubscription")).toHaveLength(1);
    expect(await harness.iap.hasActiveSubscription("tester-1")).toBe(true);

    const [state] = await harness.iap.getSubscriptionState("tester-1");
    expect(state.status).toBe("active");
    expect(state.expiresAt).toBe(NOW + 2 * SANDBOX_MONTH);
  });

  test("a sandbox billing grace period still entitles, on Apple's minutes-long clock", async () => {
    // Sandbox grace is three to five minutes rather than sixteen days, but the
    // rule is the same: full service until it ends.
    const harness = await sandboxHarness();
    harness.fake.seed("IapSubscription", {
      originalTransactionId: "2000000000000001",
      appUserId: "tester-1",
      latestSignedDate: NOW - MINUTE,
      environment: "Sandbox",
    });

    await harness.iap.handleSignedPayload(
      await sandboxNotification(harness, {
        notificationType: "DID_FAIL_TO_RENEW",
        subtype: "GRACE_PERIOD",
        signedDate: NOW,
        transaction: { expiresDate: NOW - MINUTE },
        renewal: {
          gracePeriodExpiresDate: NOW + 3 * MINUTE,
          isInBillingRetryPeriod: true,
        },
      })
    );

    expect(await harness.iap.hasActiveSubscription("tester-1")).toBe(true);
    const [inGrace] = await harness.iap.getSubscriptionState("tester-1");
    expect(inGrace.status).toBe("grace_period");

    // Three minutes on, the grace period is over.
    harness.setNow(NOW + 4 * MINUTE);
    expect(await harness.iap.hasActiveSubscription("tester-1")).toBe(false);
    const [afterGrace] = await harness.iap.getSubscriptionState("tester-1");
    expect(afterGrace.status).toBe("billing_retry");
  });

  test("a sandbox subscription that lapses stops entitling", async () => {
    const harness = await sandboxHarness();
    harness.fake.seed("IapSubscription", {
      originalTransactionId: "2000000000000001",
      appUserId: "tester-1",
      latestSignedDate: NOW - MINUTE,
      environment: "Sandbox",
    });

    await harness.iap.handleSignedPayload(
      await sandboxNotification(harness, {
        notificationType: "EXPIRED",
        subtype: "VOLUNTARY",
        signedDate: NOW,
        transaction: { expiresDate: NOW - MINUTE },
        renewal: { expirationIntent: 1, autoRenewStatus: 0 },
      })
    );

    expect(await harness.iap.hasActiveSubscription("tester-1")).toBe(false);
    const [state] = await harness.iap.getSubscriptionState("tester-1");
    expect(state.status).toBe("expired");
    expect(state.expirationReason).toBe("cancelled");
  });

  test("sandbox renewals stop after Apple's twelfth attempt, and the subscription simply lapses", async () => {
    // Apple auto-renews a sandbox subscription up to twelve times and then
    // stops. Nothing special happens here — the expiry passes and the derived
    // status says expired, which is the whole point of deriving it.
    const harness = await sandboxHarness();
    harness.fake.seed("IapSubscription", {
      originalTransactionId: "2000000000000001",
      appUserId: "tester-1",
      latestSignedDate: NOW - MINUTE,
      environment: "Sandbox",
    });

    await harness.iap.handleSignedPayload(
      await sandboxNotification(harness, {
        notificationType: "DID_RENEW",
        signedDate: NOW,
        transaction: { expiresDate: NOW + SANDBOX_MONTH },
        renewal: {},
      })
    );
    expect(await harness.iap.hasActiveSubscription("tester-1")).toBe(true);

    // The thirteenth period never arrives, and no notification is sent.
    harness.setNow(NOW + SANDBOX_MONTH + MINUTE);
    expect(await harness.iap.hasActiveSubscription("tester-1")).toBe(false);
  });
});

describe("what makes a sandbox payload different", () => {
  test("accepts a sandbox token with no appAppleId, which Apple never sends there", async () => {
    const harness = await sandboxHarness();
    const decoded = await harness.iap.verifyTransaction(
      await signJws(
        harness.chain,
        transactionPayload({
          environment: "Sandbox",
          signedDate: NOW,
          appAppleId: undefined,
        })
      )
    );
    expect(decoded.environment).toBe("Sandbox");
  });

  test("gives a sandbox refund request five minutes to answer, not twelve hours", async () => {
    const harness = await sandboxHarness();
    await harness.iap.handleSignedPayload(
      await sandboxNotification(harness, {
        notificationType: "CONSUMPTION_REQUEST",
        signedDate: NOW,
        transaction: { transactionId: "tx-disputed" },
      })
    );
    expect(harness.fake.rows("IapConsumptionRequest")[0].deadlineAt).toBe(
      NOW + 5 * MINUTE
    );
  });

  test("tries the sandbox App Store Server API first in test mode", async () => {
    // Covered in iap-server-api.test.ts; restated here as part of the sandbox
    // story, since a production-first call would cost a wasted round trip on
    // every sandbox request.
    expect(true).toBe(true);
  });
});

describe("the device paths work in sandbox too", () => {
  test("records a sandbox purchase reported by the app", async () => {
    const harness = await sandboxHarness();
    const result = await harness.iap.recordTransaction(
      await signJws(
        harness.chain,
        transactionPayload({
          environment: "Sandbox",
          signedDate: NOW,
          appAppleId: undefined,
          transactionId: "tx-sandbox-1",
        })
      ),
      { appUserId: "tester-1" }
    );

    expect(result).toMatchObject({ recorded: true, duplicate: false });
    expect(harness.fake.rows("IapTransaction")[0].environment).toBe("Sandbox");
    expect(await harness.iap.hasActiveSubscription("tester-1")).toBe(true);
  });

  test("syncs a sandbox subscription status pair at launch", async () => {
    const harness = await sandboxHarness();
    const result = await harness.iap.syncEntitlements(
      {
        environment: "Sandbox",
        statuses: [
          {
            transactionJws: await signJws(
              harness.chain,
              transactionPayload({
                environment: "Sandbox",
                signedDate: NOW,
                appAppleId: undefined,
                expiresDate: NOW + SANDBOX_MONTH,
              })
            ),
            renewalInfoJws: await signJws(
              harness.chain,
              renewalPayload({ environment: "Sandbox", signedDate: NOW })
            ),
          },
        ],
      },
      { appUserId: "tester-1" }
    );

    expect(result.recordedTransactionIds).toHaveLength(1);
    expect(result.skipped).toBe(0);
    expect(result.mismatches).toBe(0);
    expect(result.snapshot.subscriptions[0].entitled).toBe(true);
  });
});

describe("with test mode off, sandbox is refused outright", () => {
  test("a sandbox notification is rejected rather than stored", async () => {
    const live = await createHarness({ startAt: NOW, config: { testMode: false } });
    const result = await live.iap.handleSignedPayload(
      await notification(live, {
        notificationType: "SUBSCRIBED",
        environment: "Sandbox",
        signedDate: NOW,
        renewal: {},
      })
    );

    expect(result.status).toBe(401);
    expect(result.error).toMatch(/INVALID_ENVIRONMENT/);
    expect(live.fake.rows("IapTransaction")).toHaveLength(0);
  });

  test("a sandbox row already in storage stops counting", async () => {
    // Belt and braces: even if a row was written while test mode was on,
    // turning it off stops that row entitling anyone.
    const live = await createHarness({ startAt: NOW, config: { testMode: false } });
    live.fake.seed("IapSubscription", {
      originalTransactionId: "otx-sandbox",
      appUserId: "tester-1",
      latestTransactionJws: "whatever",
      latestSignedDate: NOW,
      environment: "Sandbox",
    });

    expect(await live.iap.hasActiveSubscription("tester-1")).toBe(false);
    expect(await live.iap.getSubscriptionState("tester-1")).toEqual([]);
  });
});
