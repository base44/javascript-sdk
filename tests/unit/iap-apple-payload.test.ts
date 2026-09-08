import { describe, expect, test } from "vitest";
import { createVerifier } from "../../src/iap/verify/verifier.ts";
import { createAppleVerifier } from "../../src/iap/verify/apple-verifier.ts";
import { parseJws } from "../../src/iap/verify/jws.ts";
import { verifyChain } from "../../src/iap/verify/chain.ts";
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
  test("its chain terminates at the pinned Apple Root CA G3", async () => {
    const parsed = parseJws(CAPTURED_TEST_NOTIFICATION);
    // No `roots` override — this is the production trust anchor.
    const chain = await verifyChain(parsed.chain, { at: SIGNED_DATE });

    expect(chain.root.name).toBe("Apple Root CA - G3");

    // Apple's real chain, as measured from this payload rather than assumed:
    // a P-384 root and a P-384 intermediate, then a P-256 leaf. Every link is
    // signed ecdsa-with-SHA384.
    //
    // So the cross-curve step is intermediate -> leaf: a P-384 key signing a
    // P-256 certificate. That is why the digest has to come from each
    // certificate's own signatureAlgorithm and never from the subject key's
    // curve — reading SHA-256 off the leaf's P-256 key here fails verification
    // on Apple's real chain.
    expect(chain.root.der.length).toBe(583);
    expect(chain.intermediate.publicKey.curve).toBe("P-384");
    expect(chain.intermediate.signatureAlgorithm.hash).toBe("SHA-384");
    expect(chain.leaf.publicKey.curve).toBe("P-256");
    expect(chain.leaf.signatureAlgorithm.hash).toBe("SHA-384");
  });

  test.each([
    ["builtin", () => createVerifier({ config: CONFIG })],
    ["apple", () => createAppleVerifier({ config: CONFIG })],
  ])("the %s verifier accepts it and decodes the same values", async (_name, build) => {
    const decoded = await build().verifyNotification(CAPTURED_TEST_NOTIFICATION);

    expect(decoded.notificationType).toBe("TEST");
    expect(decoded.notificationUUID).toBe("63e18bac-9d46-4766-b1ec-b511e4758173");
    expect(decoded.version).toBe("2.0");
    expect(decoded.signedDate).toBe(SIGNED_DATE);
    expect(decoded.data?.bundleId).toBe(CAPTURED_BUNDLE_ID);
    expect(decoded.data?.environment).toBe("Sandbox");
    // A TEST notification carries no transaction.
    expect(decoded.data?.transactionInfo).toBeUndefined();
  });

  test("both verifiers produce identical output for it", async () => {
    const [builtin, apple] = await Promise.all([
      createVerifier({ config: CONFIG }).verifyNotification(CAPTURED_TEST_NOTIFICATION),
      createAppleVerifier({ config: CONFIG }).verifyNotification(
        CAPTURED_TEST_NOTIFICATION
      ),
    ]);
    expect(apple).toEqual(builtin);
  });

  test.each([
    ["builtin", () => createVerifier({ config: { ...CONFIG, testMode: false } })],
    ["apple", () => createAppleVerifier({ config: { ...CONFIG, testMode: false } })],
  ])("the %s verifier refuses it when test mode is off", async (_name, build) => {
    await expect(
      build().verifyNotification(CAPTURED_TEST_NOTIFICATION)
    ).rejects.toMatchObject({ code: "INVALID_ENVIRONMENT" });
  });

  test.each([
    ["builtin", () => createVerifier({ config: { ...CONFIG, bundleId: "com.someone.else" } })],
    ["apple", () => createAppleVerifier({ config: { ...CONFIG, bundleId: "com.someone.else" } })],
  ])("the %s verifier refuses it for the wrong app", async (_name, build) => {
    await expect(
      build().verifyNotification(CAPTURED_TEST_NOTIFICATION)
    ).rejects.toMatchObject({ code: "INVALID_APP_IDENTIFIER" });
  });

  test.each([
    ["builtin", () => createVerifier({ config: CONFIG })],
    ["apple", () => createAppleVerifier({ config: CONFIG })],
  ])("the %s verifier rejects it once a byte is changed", async (_name, build) => {
    const [header, payload, signature] = CAPTURED_TEST_NOTIFICATION.split(".");
    const flipped = signature.slice(0, -2) + (signature.endsWith("AA") ? "BB" : "AA");
    await expect(
      build().verifyNotification(`${header}.${payload}.${flipped}`)
    ).rejects.toBeDefined();
  });
});
