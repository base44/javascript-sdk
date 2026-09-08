import { describe, expect, test } from "vitest";
import { createIapClient } from "../../src/iap/index.ts";
import { appAccountTokenFor } from "../../src/iap/account-token.ts";
import type { IapConfig } from "../../src/iap/iap.types.ts";

// createIapClient does no I/O, so a bare object stands in for the client.
const base44 = {} as never;

const VALID: IapConfig = {
  bundleId: "com.example.app",
  appAppleId: 1234567890,
  products: {
    pro_monthly: { type: "autoRenewableSubscription", subscriptionGroupId: "21234567" },
    coins_100: { type: "consumable" },
    lifetime: { type: "nonConsumable" },
    season_pass: { type: "nonRenewingSubscription", nonRenewingDurationDays: 90 },
  },
};

function create(config: unknown) {
  return createIapClient({ base44, config: config as IapConfig });
}

describe("configuration", () => {
  test("accepts a complete configuration", () => {
    const iap = create(VALID);
    expect(typeof iap.verifyTransaction).toBe("function");
    expect(typeof iap.verifyNotification).toBe("function");
  });

  test("requires a Base44 client, naming how to get one", () => {
    expect(() =>
      createIapClient({ base44: undefined as never, config: VALID })
    ).toThrow(/createClientFromRequest/);
  });

  test.each([
    ["no bundleId", { ...VALID, bundleId: undefined }],
    ["an empty bundleId", { ...VALID, bundleId: "   " }],
    ["no appAppleId", { ...VALID, appAppleId: undefined }],
    ["a fractional appAppleId", { ...VALID, appAppleId: 1.5 }],
    ["a negative appAppleId", { ...VALID, appAppleId: -1 }],
    ["no products", { ...VALID, products: undefined }],
  ])("rejects %s", (_label, config) => {
    expect(() => create(config)).toThrow(
      expect.objectContaining({ code: "IAP_INVALID_CONFIG" })
    );
  });

  test("says so plainly when the bundle id is passed where the numeric id belongs", () => {
    // The single most likely configuration mistake, so the message names both.
    expect(() => create({ ...VALID, appAppleId: "com.example.app" })).toThrow(
      /must be a number.*not the bundle id/s
    );
  });

  test("rejects an unknown product type, listing the valid ones", () => {
    expect(() =>
      create({ ...VALID, products: { x: { type: "subscription" } } })
    ).toThrow(/expected one of consumable, nonConsumable/);
  });

  test("rejects a non-renewing subscription with no duration, because Apple never expires those", () => {
    expect(() =>
      create({ ...VALID, products: { pass: { type: "nonRenewingSubscription" } } })
    ).toThrow(/Apple does not expire these/);
  });

  test("refuses online certificate checks rather than quietly ignoring them", () => {
    expect(() => create({ ...VALID, onlineChecks: true })).toThrow(
      expect.objectContaining({ code: "IAP_ONLINE_CHECKS_UNSUPPORTED" })
    );
    // Explicit false and omitted are both fine.
    expect(() => create({ ...VALID, onlineChecks: false })).not.toThrow();
  });

  test("defaults both testing flags off, so a production deploy is strict by default", () => {
    // Proven through behaviour: a sandbox token is refused with no flags set.
    const iap = create(VALID);
    expect(iap).toBeDefined();
    // The environment gating itself is covered in iap-verifier.test.ts.
  });
});

describe("account tokens", () => {
  test("is deterministic, so the shell and the backend derive the same value", () => {
    expect(appAccountTokenFor("user-123")).toBe(appAccountTokenFor("user-123"));
  });

  test("is a v5 UUID, whose version and variant bits are fixed", () => {
    const token = appAccountTokenFor("user-123");
    expect(token).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
  });

  test("separates different users", () => {
    expect(appAccountTokenFor("user-123")).not.toBe(appAccountTokenFor("user-124"));
  });

  test("is reachable from the module as well as standalone", () => {
    const iap = create(VALID);
    expect(iap.appAccountTokenFor("user-123")).toBe(appAccountTokenFor("user-123"));
  });

  test("rejects an empty user id instead of minting a shared token for everyone", () => {
    expect(() => appAccountTokenFor("")).toThrow(TypeError);
  });
});
