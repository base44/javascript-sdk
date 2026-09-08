import { beforeEach, describe, expect, test, vi } from "vitest";
import { createIapClient } from "../../src/iap/index.ts";
import type { Base44Client } from "../../src/client.types.ts";
import { base64UrlToBytes, bytesToBase64 } from "../../src/iap/runtime/base64.ts";
import { FakeEntities } from "../iap/fixtures/fake-entities.ts";
import { APP_APPLE_ID, BASE_PRODUCTS, BUNDLE_ID } from "../iap/fixtures/harness.ts";

const NOW = Date.UTC(2026, 8, 3, 12, 0, 0);

/** A real P-256 key, PEM-armoured the way Apple ships a .p8 file. */
async function generateP8(): Promise<string> {
  const keys = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );
  const pkcs8 = new Uint8Array(
    await crypto.subtle.exportKey("pkcs8", keys.privateKey)
  );
  const body = bytesToBase64(pkcs8).replace(/(.{64})/g, "$1\n");
  return `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----\n`;
}

let privateKeyP8: string;

interface StubResponse {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
}

/** A fetch stub that answers per call and records what it was asked. */
function stubFetch(responses: StubResponse[]) {
  const calls: { url: string; method: string; body?: unknown; auth?: string }[] = [];
  let index = 0;

  const impl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const request = String(url);
    const headers = new Headers(init?.headers);
    calls.push({
      url: request,
      method: init?.method ?? "GET",
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      auth: headers.get("Authorization") ?? undefined,
    });

    const answer = responses[Math.min(index, responses.length - 1)];
    index += 1;
    return new Response(answer.body === undefined ? "" : JSON.stringify(answer.body), {
      status: answer.status,
      headers: answer.headers,
    });
  });

  return { impl: impl as unknown as typeof fetch, calls };
}

function clientWith(
  responses: StubResponse[],
  overrides: { serverApi?: unknown; testMode?: boolean } = {}
) {
  const fake = new FakeEntities();
  const stub = stubFetch(responses);
  const base44 = {
    get asServiceRole() {
      return { entities: fake.module };
    },
  } as unknown as Base44Client;

  const iap = createIapClient({
    base44,
    config: {
      bundleId: BUNDLE_ID,
      appAppleId: APP_APPLE_ID,
      products: BASE_PRODUCTS,
      testMode: overrides.testMode,
      serverApi:
        overrides.serverApi === undefined
          ? { keyId: "ABC123DEFG", issuerId: "issuer-uuid", privateKeyP8 }
          : (overrides.serverApi as never),
    },
    internal: { clock: () => NOW, fetchImpl: stub.impl },
  });

  return { iap, calls: stub.calls };
}

function decodeSegment(segment: string): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(segment)));
}

beforeEach(async () => {
  if (!privateKeyP8) privateKeyP8 = await generateP8();
});

describe("the bearer token", () => {
  test("carries exactly the claims Apple requires", async () => {
    const { iap, calls } = clientWith([
      { status: 200, body: { testNotificationToken: "token-1" } },
    ]);
    await iap.serverApi.requestTestNotification();

    const jwt = calls[0].auth?.replace("Bearer ", "") ?? "";
    const [header, payload, signature] = jwt.split(".");

    expect(decodeSegment(header)).toEqual({
      alg: "ES256",
      kid: "ABC123DEFG",
      typ: "JWT",
    });
    expect(decodeSegment(payload)).toEqual({
      iss: "issuer-uuid",
      iat: NOW / 1000,
      exp: NOW / 1000 + 300,
      aud: "appstoreconnect-v1",
      bid: BUNDLE_ID,
    });
    // An ES256 signature is raw r ‖ s: two 32-byte scalars, and no DER
    // wrapper, unlike a certificate signature.
    expect(base64UrlToBytes(signature)).toHaveLength(64);
  });

  test("expires well inside Apple's 60-minute ceiling", async () => {
    const { iap, calls } = clientWith([
      { status: 200, body: { testNotificationToken: "token-1" } },
    ]);
    await iap.serverApi.requestTestNotification();
    const payload = decodeSegment(calls[0].auth!.replace("Bearer ", "").split(".")[1]);
    expect((payload.exp as number) - (payload.iat as number)).toBe(300);
  });
});

describe("sendConsumptionInformation", () => {
  test("puts the data to Apple's v2 endpoint", async () => {
    const { iap, calls } = clientWith([{ status: 202 }]);
    await iap.serverApi.sendConsumptionInformation("2000000123456789", {
      customerConsented: true,
      deliveryStatus: "DELIVERED",
      sampleContentProvided: false,
      consumptionPercentage: 100000,
    });

    expect(calls[0].method).toBe("PUT");
    expect(calls[0].url).toBe(
      "https://api.storekit.apple.com/inApps/v2/transactions/consumption/2000000123456789"
    );
    expect(calls[0].body).toMatchObject({
      customerConsented: true,
      deliveryStatus: "DELIVERED",
    });
  });

  test("refuses to send anything without the customer's consent", async () => {
    // Apple rejects this too, but failing here says why — and sending
    // consumption data without consent would be wrong regardless.
    const { iap, calls } = clientWith([{ status: 202 }]);
    await expect(
      iap.serverApi.sendConsumptionInformation("tx-1", {
        customerConsented: false as never,
        deliveryStatus: "DELIVERED",
        sampleContentProvided: false,
      })
    ).rejects.toMatchObject({ code: "IAP_INVALID_CONFIG" });
    expect(calls).toHaveLength(0);
  });

  test("surfaces Apple's own error code and message", async () => {
    const { iap } = clientWith([
      { status: 400, body: { errorCode: 4000035, errorMessage: "Invalid customer consent." } },
    ]);
    await expect(
      iap.serverApi.sendConsumptionInformation("tx-1", {
        customerConsented: true,
        deliveryStatus: "DELIVERED",
        sampleContentProvided: false,
      })
    ).rejects.toMatchObject({
      code: "IAP_API_ERROR",
      httpStatus: 400,
      appleErrorCode: 4000035,
    });
  });
});

describe("test notifications", () => {
  test("asks Apple to send one and returns the token", async () => {
    const { iap, calls } = clientWith([
      { status: 200, body: { testNotificationToken: "token-abc" } },
    ]);
    const result = await iap.serverApi.requestTestNotification();

    expect(result.testNotificationToken).toBe("token-abc");
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe(
      "https://api.storekit.apple.com/inApps/v1/notifications/test"
    );
  });

  test("reports every delivery attempt", async () => {
    const { iap, calls } = clientWith([
      {
        status: 200,
        body: {
          sendAttempts: [
            { attemptDate: NOW - 60_000, sendAttemptResult: "TIMED_OUT" },
            { attemptDate: NOW, sendAttemptResult: "SUCCESS" },
          ],
          signedPayload: "eyJ...",
        },
      },
    ]);

    const status = await iap.serverApi.getTestNotificationStatus("token-abc");
    expect(status.sendAttempts).toHaveLength(2);
    expect(status.sendAttempts.at(-1)?.sendAttemptResult).toBe("SUCCESS");
    expect(calls[0].url).toBe(
      "https://api.storekit.apple.com/inApps/v1/notifications/test/token-abc"
    );
  });
});

describe("environments", () => {
  test("falls back to sandbox when production does not have the transaction", async () => {
    // A transaction lives in exactly one environment, and nothing in the token
    // says which, so Apple's own guidance is to try one and then the other.
    const { iap, calls } = clientWith([
      { status: 404, body: { errorCode: 4040010, errorMessage: "Transaction id not found." } },
      { status: 202 },
    ]);

    await iap.serverApi.sendConsumptionInformation("tx-sandbox", {
      customerConsented: true,
      deliveryStatus: "DELIVERED",
      sampleContentProvided: false,
    });

    expect(calls).toHaveLength(2);
    expect(calls[0].url).toContain("api.storekit.apple.com");
    expect(calls[1].url).toContain("api.storekit-sandbox.apple.com");
  });

  test("tries sandbox first in test mode, saving a round trip", async () => {
    const { iap, calls } = clientWith(
      [{ status: 200, body: { testNotificationToken: "t" } }],
      { testMode: true }
    );
    await iap.serverApi.requestTestNotification();
    expect(calls[0].url).toContain("api.storekit-sandbox.apple.com");
  });

  test("reports a transaction that exists in neither environment", async () => {
    const { iap, calls } = clientWith([
      { status: 404, body: { errorCode: 4040010 } },
      { status: 404, body: { errorCode: 4040010 } },
    ]);

    await expect(
      iap.serverApi.sendConsumptionInformation("tx-nowhere", {
        customerConsented: true,
        deliveryStatus: "DELIVERED",
        sampleContentProvided: false,
      })
    ).rejects.toMatchObject({ code: "IAP_API_TRANSACTION_NOT_FOUND" });
    expect(calls).toHaveLength(2);
  });
});

describe("rate limits", () => {
  test("surfaces Retry-After as the absolute timestamp Apple actually sends", async () => {
    // Apple sends an absolute epoch-millisecond timestamp here, not a delay.
    // Treating it as seconds would mean retrying almost immediately, straight
    // back into the same limit.
    const retryAt = NOW + 3_600_000;
    const { iap } = clientWith([
      {
        status: 429,
        body: { errorCode: 4290000, errorMessage: "Rate limit exceeded." },
        headers: { "Retry-After": String(retryAt) },
      },
    ]);

    const failure = await iap.serverApi.requestTestNotification().catch((e) => e);
    expect(failure).toMatchObject({
      code: "IAP_API_RATE_LIMITED",
      httpStatus: 429,
      retryAfter: retryAt,
    });
    // Compared against the frozen clock, not the wall clock: the point is
    // that it is a future absolute timestamp rather than a small delay.
    expect(failure.retryAfter).toBeGreaterThan(NOW);
    expect(failure.retryAfter).toBeGreaterThan(1_000_000_000_000);
    expect(failure.message).toMatch(/absolute timestamp/);
  });
});

describe("configuration", () => {
  test("says what is missing when no key is configured", async () => {
    const { iap, calls } = clientWith([{ status: 200 }], { serverApi: null });
    const failure = await iap.serverApi.requestTestNotification().catch((e) => e);

    expect(failure.code).toBe("IAP_SERVER_API_NOT_CONFIGURED");
    expect(failure.message).toMatch(/In-App Purchase key/);
    // And it says the important part: verification does not need this.
    expect(failure.message).toMatch(/do not need it/);
    expect(calls).toHaveLength(0);
  });

  test("the module is present even without credentials, so its shape never varies", () => {
    const { iap } = clientWith([{ status: 200 }], { serverApi: null });
    expect(typeof iap.serverApi.requestTestNotification).toBe("function");
    expect(typeof iap.serverApi.sendConsumptionInformation).toBe("function");
    expect(typeof iap.serverApi.getTestNotificationStatus).toBe("function");
  });

  test.each([
    ["a missing keyId", { issuerId: "i", privateKeyP8: "-----BEGIN PRIVATE KEY-----\\nx\\n-----END PRIVATE KEY-----" }],
    ["a missing issuerId", { keyId: "k", privateKeyP8: "-----BEGIN PRIVATE KEY-----\\nx\\n-----END PRIVATE KEY-----" }],
    ["a missing key", { keyId: "k", issuerId: "i" }],
  ])("rejects %s at construction", (_label, serverApi) => {
    expect(() => clientWith([], { serverApi })).toThrow(
      expect.objectContaining({ code: "IAP_INVALID_CONFIG" })
    );
  });

  test("rejects a key that is not a .p8 file, naming what to pass instead", () => {
    expect(() =>
      clientWith([], {
        serverApi: { keyId: "k", issuerId: "i", privateKeyP8: "just-some-base64" },
      })
    ).toThrow(/whole contents, including the BEGIN and END lines/);
  });

  test("rejects a .p8 whose contents are not a P-256 key, at the point of use", async () => {
    const { iap } = clientWith([{ status: 200 }], {
      serverApi: {
        keyId: "k",
        issuerId: "i",
        privateKeyP8: "-----BEGIN PRIVATE KEY-----\nbm90LWEta2V5\n-----END PRIVATE KEY-----",
      },
    });
    await expect(iap.serverApi.requestTestNotification()).rejects.toMatchObject({
      code: "IAP_INVALID_CONFIG",
    });
  });
});
