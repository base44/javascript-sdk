import { describe, expect, test } from "vitest";
import { createVerifier } from "../../src/iap/verify/verifier.ts";
import { normalizeEnvironment } from "../../src/iap/verify/payload-checks.ts";
import {
  createTestChain,
  trustAnchorsFor,
  validChain,
} from "../iap/fixtures/test-chain.ts";
import { signJws } from "../iap/fixtures/sign-jws.ts";

const BUNDLE_ID = "com.example.app";
const APP_APPLE_ID = 1234567890;
const SIGNED_DATE = Date.UTC(2026, 8, 3);

const BASE_CONFIG = {
  bundleId: BUNDLE_ID,
  appAppleId: APP_APPLE_ID,
  testMode: false,
  allowLocalTesting: false,
};

/** A verifier pinned to a test chain, with config overrides. */
async function verifierFor(
  overrides: Partial<typeof BASE_CONFIG> = {},
  chainOverride?: Awaited<ReturnType<typeof validChain>>
) {
  const chain = chainOverride ?? (await validChain());
  return {
    chain,
    verifier: createVerifier({
      config: { ...BASE_CONFIG, ...overrides },
      roots: trustAnchorsFor(chain),
    }),
  };
}

function transactionPayload(overrides: Record<string, unknown> = {}) {
  return {
    transactionId: "2000000123456789",
    originalTransactionId: "2000000123456789",
    bundleId: BUNDLE_ID,
    appAppleId: APP_APPLE_ID,
    productId: "pro_monthly",
    type: "Auto-Renewable Subscription",
    environment: "Production",
    signedDate: SIGNED_DATE,
    purchaseDate: SIGNED_DATE - 1000,
    expiresDate: SIGNED_DATE + 2_592_000_000,
    ...overrides,
  };
}

describe("normalizeEnvironment", () => {
  test.each([
    ["Production", "Production"],
    ["production", "Production"],
    ["PRODUCTION", "Production"],
    ["Sandbox", "Sandbox"],
    ["sandbox", "Sandbox"],
    ["Xcode", "Xcode"],
    ["xcode", "Xcode"],
    [" Production ", "Production"],
  ])("reads %s as %s, because Apple's docs spell it inconsistently", (input, expected) => {
    expect(normalizeEnvironment(input)).toBe(expected);
  });

  test.each([["Staging"], [""], [null], [undefined], [42]])(
    "returns undefined for %p rather than guessing",
    (input) => {
      expect(normalizeEnvironment(input)).toBeUndefined();
    }
  );
});

describe("verifyTransaction", () => {
  test("decodes a valid production transaction", async () => {
    const { chain, verifier } = await verifierFor();
    const decoded = await verifier.verifyTransaction(
      await signJws(chain, transactionPayload())
    );
    expect(decoded.transactionId).toBe("2000000123456789");
    expect(decoded.productId).toBe("pro_monthly");
    expect(decoded.environment).toBe("Production");
  });

  test("keeps fields this SDK does not model", async () => {
    const { chain, verifier } = await verifierFor();
    const decoded = await verifier.verifyTransaction(
      await signJws(chain, transactionPayload({ futureAppleField: "keep me" }))
    );
    expect(decoded.futureAppleField).toBe("keep me");
  });

  test("rejects a transaction for a different app", async () => {
    const { chain, verifier } = await verifierFor();
    const token = await signJws(
      chain,
      transactionPayload({ bundleId: "com.someone.else" })
    );
    await expect(verifier.verifyTransaction(token)).rejects.toMatchObject({
      code: "INVALID_APP_IDENTIFIER",
    });
  });

  test("rejects a production transaction with the wrong appAppleId", async () => {
    const { chain, verifier } = await verifierFor();
    const token = await signJws(chain, transactionPayload({ appAppleId: 999 }));
    await expect(verifier.verifyTransaction(token)).rejects.toMatchObject({
      code: "INVALID_APP_IDENTIFIER",
    });
  });

  test("rejects a production transaction with no appAppleId at all", async () => {
    const { chain, verifier } = await verifierFor();
    const payload = transactionPayload();
    delete (payload as Record<string, unknown>).appAppleId;
    await expect(
      verifier.verifyTransaction(await signJws(chain, payload))
    ).rejects.toMatchObject({ code: "INVALID_APP_IDENTIFIER" });
  });

  test("rejects a transaction with no signedDate, since certificates could not be dated", async () => {
    const { chain, verifier } = await verifierFor();
    const payload = transactionPayload();
    delete (payload as Record<string, unknown>).signedDate;
    await expect(
      verifier.verifyTransaction(await signJws(chain, payload))
    ).rejects.toMatchObject({ code: "INVALID_JWS_FORMAT" });
  });
});

describe("environment gating", () => {
  test("rejects a sandbox transaction when test mode is off", async () => {
    const { chain, verifier } = await verifierFor({ testMode: false });
    const token = await signJws(
      chain,
      transactionPayload({ environment: "Sandbox" })
    );
    await expect(verifier.verifyTransaction(token)).rejects.toMatchObject({
      code: "INVALID_ENVIRONMENT",
    });
  });

  test("accepts a sandbox transaction with no appAppleId when test mode is on, because Apple omits it there", async () => {
    const { chain, verifier } = await verifierFor({ testMode: true });
    const payload = transactionPayload({ environment: "Sandbox" });
    delete (payload as Record<string, unknown>).appAppleId;

    const decoded = await verifier.verifyTransaction(await signJws(chain, payload));
    expect(decoded.environment).toBe("Sandbox");
  });

  test("rejects an Xcode transaction when local testing is off", async () => {
    const { chain, verifier } = await verifierFor({ allowLocalTesting: false });
    const token = await signJws(chain, transactionPayload({ environment: "Xcode" }));
    await expect(verifier.verifyTransaction(token)).rejects.toMatchObject({
      code: "INVALID_ENVIRONMENT",
    });
  });

  test("accepts an Xcode transaction signed by an untrusted chain when local testing is on", async () => {
    // Xcode signs its own tokens, so they cannot chain to an Apple root. The
    // token here is signed by a chain the verifier does not trust at all, which
    // is the point: with local testing on, chain validation is skipped.
    const stranger = await createTestChain();
    const trusted = await validChain();
    const verifier = createVerifier({
      config: { ...BASE_CONFIG, allowLocalTesting: true },
      roots: trustAnchorsFor(trusted),
    });

    const decoded = await verifier.verifyTransaction(
      await signJws(stranger, transactionPayload({ environment: "Xcode" }))
    );
    expect(decoded.environment).toBe("Xcode");
  });

  test("still checks the app identity on an Xcode token, so local testing is not a blanket bypass", async () => {
    const stranger = await createTestChain();
    const trusted = await validChain();
    const verifier = createVerifier({
      config: { ...BASE_CONFIG, allowLocalTesting: true },
      roots: trustAnchorsFor(trusted),
    });

    const token = await signJws(
      stranger,
      transactionPayload({ environment: "Xcode", bundleId: "com.someone.else" })
    );
    await expect(verifier.verifyTransaction(token)).rejects.toMatchObject({
      code: "INVALID_APP_IDENTIFIER",
    });
  });
});

describe("verifyNotification", () => {
  async function notificationToken(
    chain: Awaited<ReturnType<typeof validChain>>,
    overrides: {
      readonly data?: Record<string, unknown>;
      readonly envelope?: Record<string, unknown>;
    } = {}
  ) {
    const transaction = await signJws(chain, transactionPayload());
    const renewal = await signJws(chain, {
      originalTransactionId: "2000000123456789",
      productId: "pro_monthly",
      autoRenewProductId: "pro_monthly",
      autoRenewStatus: 1,
      environment: "Production",
      signedDate: SIGNED_DATE,
    });

    return signJws(chain, {
      notificationType: "DID_RENEW",
      notificationUUID: "d1f2e3a4-0000-4000-8000-000000000001",
      version: "2.0",
      signedDate: SIGNED_DATE,
      data: {
        appAppleId: APP_APPLE_ID,
        bundleId: BUNDLE_ID,
        bundleVersion: "42",
        environment: "Production",
        status: 1,
        signedTransactionInfo: transaction,
        signedRenewalInfo: renewal,
        ...overrides.data,
      },
      ...overrides.envelope,
    });
  }

  test("verifies the envelope and both inner tokens, and returns them decoded", async () => {
    const { chain, verifier } = await verifierFor();
    const decoded = await verifier.verifyNotification(
      await notificationToken(chain)
    );

    expect(decoded.notificationType).toBe("DID_RENEW");
    expect(decoded.notificationUUID).toBe("d1f2e3a4-0000-4000-8000-000000000001");
    expect(decoded.signedDate).toBe(SIGNED_DATE);
    expect(decoded.data?.status).toBe(1);
    expect(decoded.data?.transactionInfo?.transactionId).toBe("2000000123456789");
    expect(decoded.data?.renewalInfo?.autoRenewStatus).toBe(1);

    // The unverified field name is gone, so no caller can act on a token that
    // was never checked...
    expect(
      (decoded.data as Record<string, unknown>).signedTransactionInfo
    ).toBeUndefined();
    expect(
      (decoded.data as Record<string, unknown>).signedRenewalInfo
    ).toBeUndefined();

    // ...but the original bytes come back under a name that says they are
    // verified, because storage needs them: the signed token is the source of
    // truth every derived value is recomputed from.
    expect(decoded.data?.transactionInfoJws).toBeTypeOf("string");
    expect(decoded.data?.renewalInfoJws).toBeTypeOf("string");
  });

  test("rejects a notification whose inner transaction was tampered with", async () => {
    const { chain, verifier } = await verifierFor();
    const tamperedInner = await signJws(chain, transactionPayload(), {
      tamperPayload: true,
    });
    const token = await notificationToken(chain, {
      data: { signedTransactionInfo: tamperedInner },
    });

    // The envelope's own signature is fine; the inner token's is not.
    await expect(verifier.verifyNotification(token)).rejects.toMatchObject({
      code: "INVALID_SIGNATURE",
    });
  });

  test("rejects a notification whose inner transaction is for another app", async () => {
    const { chain, verifier } = await verifierFor();
    const foreignInner = await signJws(
      chain,
      transactionPayload({ bundleId: "com.someone.else" })
    );
    const token = await notificationToken(chain, {
      data: { signedTransactionInfo: foreignInner },
    });
    await expect(verifier.verifyNotification(token)).rejects.toMatchObject({
      code: "INVALID_APP_IDENTIFIER",
    });
  });

  test("rejects a notification with no notificationUUID, since it could not be de-duplicated", async () => {
    const { chain, verifier } = await verifierFor();
    const token = await notificationToken(chain, {
      envelope: { notificationUUID: undefined },
    });
    await expect(verifier.verifyNotification(token)).rejects.toMatchObject({
      code: "INVALID_JWS_FORMAT",
    });
  });

  test("rejects a notification with no notificationType", async () => {
    const { chain, verifier } = await verifierFor();
    const token = await notificationToken(chain, {
      envelope: { notificationType: undefined },
    });
    await expect(verifier.verifyNotification(token)).rejects.toMatchObject({
      code: "INVALID_JWS_FORMAT",
    });
  });

  test("handles a notification with a summary block instead of data", async () => {
    const { chain, verifier } = await verifierFor();
    const token = await signJws(chain, {
      notificationType: "RENEWAL_EXTENSION",
      subtype: "SUMMARY",
      notificationUUID: "d1f2e3a4-0000-4000-8000-000000000002",
      version: "2.0",
      signedDate: SIGNED_DATE,
      summary: {
        requestIdentifier: "req-1",
        environment: "Production",
        appAppleId: APP_APPLE_ID,
        bundleId: BUNDLE_ID,
        productId: "pro_monthly",
        succeededCount: 10,
        failedCount: 1,
      },
    });

    const decoded = await verifier.verifyNotification(token);
    expect(decoded.subtype).toBe("SUMMARY");
    expect(decoded.summary?.succeededCount).toBe(10);
    expect(decoded.data).toBeUndefined();
  });
});
