import { describe, expect, test } from "vitest";
import { createVerifier } from "../../src/iap/verify/verifier.ts";
import {
  CAPTURED_BUNDLE_ID,
  CAPTURED_TEST_NOTIFICATION,
} from "../iap/fixtures/apple-captured.ts";

// The only test that runs against Apple's real trust chain rather than a
// chain minted here: real Apple Root CA G3, real WWDR intermediate, real
// receipt-signing leaf, real signature.
const CONFIG = {
  bundleId: CAPTURED_BUNDLE_ID,
  // Absent from sandbox payloads, so never compared. Any value works.
  appAppleId: 1,
  testMode: true,
  allowLocalTesting: false,
};

const SIGNED_DATE = 1788870417666;

describe("a real Apple sandbox notification", () => {
  test("it verifies against Apple's real trust chain and decodes correctly", async () => {
    const decoded = await createVerifier({ config: CONFIG }).verifyNotification(
      CAPTURED_TEST_NOTIFICATION
    );

    expect(decoded.notificationType).toBe("TEST");
    expect(decoded.notificationUUID).toBe("63e18bac-9d46-4766-b1ec-b511e4758173");
    expect(decoded.version).toBe("2.0");
    expect(decoded.signedDate).toBe(SIGNED_DATE);
    expect(decoded.data?.bundleId).toBe(CAPTURED_BUNDLE_ID);
    expect(decoded.data?.environment).toBe("Sandbox");
    // A TEST notification carries no transaction.
    expect(decoded.data?.transactionInfo).toBeUndefined();
  });

  test("it is refused when test mode is off", async () => {
    await expect(
      createVerifier({ config: { ...CONFIG, testMode: false } }).verifyNotification(
        CAPTURED_TEST_NOTIFICATION
      )
    ).rejects.toMatchObject({ code: "INVALID_ENVIRONMENT" });
  });

  test("it is refused for the wrong app", async () => {
    // The exact failure a mismatched bundleId produces: a 401 from the webhook.
    await expect(
      createVerifier({
        config: { ...CONFIG, bundleId: "com.someone.else" },
      }).verifyNotification(CAPTURED_TEST_NOTIFICATION)
    ).rejects.toMatchObject({ code: "INVALID_APP_IDENTIFIER" });
  });

  test("it is rejected once a single signature byte is changed", async () => {
    const [header, payload, signature] = CAPTURED_TEST_NOTIFICATION.split(".");
    const flipped = signature.slice(0, -2) + (signature.endsWith("AA") ? "BB" : "AA");
    await expect(
      createVerifier({ config: CONFIG }).verifyNotification(
        `${header}.${payload}.${flipped}`
      )
    ).rejects.toBeDefined();
  });
});
