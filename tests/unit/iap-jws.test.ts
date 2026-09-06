import { describe, expect, test } from "vitest";
import { parseJws, verifyJws } from "../../src/iap/verify/jws.ts";
import { verifyChain } from "../../src/iap/verify/chain.ts";
import { appleRoots } from "../../src/iap/verify/apple-roots.ts";
import { IapVerificationError } from "../../src/iap/errors.ts";
import {
  createTestChain,
  trustAnchorsFor,
  validChain,
} from "../iap/fixtures/test-chain.ts";
import { signJws } from "../iap/fixtures/sign-jws.ts";

const SIGNED_DATE = Date.UTC(2026, 8, 3);

const PAYLOAD = {
  transactionId: "2000000123456789",
  originalTransactionId: "2000000123456789",
  bundleId: "com.example.app",
  productId: "pro_monthly",
  environment: "Production",
  signedDate: SIGNED_DATE,
};

/** Asserts the promise rejects with an IapVerificationError carrying `code`. */
async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toThrow(IapVerificationError);
  await expect(promise).rejects.toMatchObject({ code });
}

describe("JWS verification, happy path", () => {
  test("verifies a well-formed token signed by a pinned chain", async () => {
    const chain = await validChain();
    const parsed = parseJws(await signJws(chain, PAYLOAD));

    expect(parsed.header.alg).toBe("ES256");
    expect(parsed.header.x5c).toHaveLength(3);
    expect(parsed.payload.transactionId).toBe("2000000123456789");
    expect(parsed.signature).toHaveLength(64);

    await expect(
      verifyJws(parsed, { at: SIGNED_DATE, roots: trustAnchorsFor(chain) })
    ).resolves.toBeUndefined();
  });

  test("preserves fields it does not model, so a new Apple field is never dropped", async () => {
    const chain = await validChain();
    const parsed = parseJws(
      await signJws(chain, {
        ...PAYLOAD,
        somethingAppleAddedLater: { nested: [1, 2, 3] },
      })
    );
    expect(parsed.payload.somethingAppleAddedLater).toEqual({ nested: [1, 2, 3] });
  });

  test("returns the leaf, intermediate and the root it pinned against", async () => {
    const chain = await validChain();
    const result = await verifyChain(chain.x5c, {
      at: SIGNED_DATE,
      roots: trustAnchorsFor(chain),
    });
    expect(result.root.name).toBe("Test Apple Root CA");
    expect(result.leaf.publicKey.curve).toBe("P-256");
    // Apple's real shape: a P-384 root signs a P-256 intermediate, so the
    // intermediate's own signature digest is SHA-384 while its key is P-256.
    expect(result.intermediate.publicKey.curve).toBe("P-256");
    expect(result.intermediate.signatureAlgorithm.hash).toBe("SHA-384");
  });
});

describe("JWS verification evaluates certificates at signedDate", () => {
  test("accepts a token whose leaf has since expired, which is what keeps stored tokens verifiable", async () => {
    const chain = await createTestChain({
      leafNotBefore: new Date(Date.UTC(2020, 0, 1)),
      leafNotAfter: new Date(Date.UTC(2021, 0, 1)),
    });
    const signedAt = Date.UTC(2020, 5, 1);
    const parsed = parseJws(await signJws(chain, { ...PAYLOAD, signedDate: signedAt }));

    // Valid at the moment Apple signed it.
    await expect(
      verifyJws(parsed, { at: signedAt, roots: trustAnchorsFor(chain) })
    ).resolves.toBeUndefined();

    // The same token checked against today's clock fails, which is why v1
    // pins the instant to signedDate rather than "now".
    await expectCode(
      verifyJws(parsed, { at: Date.now(), roots: trustAnchorsFor(chain) }),
      "INVALID_CERTIFICATE"
    );
  });
});

describe("JWS rejection", () => {
  test("rejects a chain that does not terminate at a pinned root", async () => {
    const chain = await validChain();
    const stranger = await createTestChain();
    const parsed = parseJws(await signJws(chain, PAYLOAD));

    await expectCode(
      verifyJws(parsed, { at: SIGNED_DATE, roots: trustAnchorsFor(stranger) }),
      "INVALID_CERTIFICATE"
    );
  });

  test("rejects a test chain against the real Apple roots, so the default pin is live", async () => {
    const chain = await validChain();
    const parsed = parseJws(await signJws(chain, PAYLOAD));
    await expectCode(verifyJws(parsed, { at: SIGNED_DATE }), "INVALID_CERTIFICATE");
  });

  test("rejects a chain anchored at an RSA Apple root rather than trusting it", async () => {
    const chain = await validChain();
    const g2 = appleRoots()[1];
    await expectCode(
      verifyChain([chain.x5c[0], chain.x5c[1], g2.der], {
        at: SIGNED_DATE,
        roots: [g2],
      }),
      "UNSUPPORTED_CERT_ALGORITHM"
    );
  });

  test.each([
    ["two certificates", 2],
    ["one certificate", 1],
  ])("rejects a chain of %s", async (_label, count) => {
    const chain = await validChain();
    const token = await signJws(chain, PAYLOAD, { x5c: chain.x5c.slice(0, count) });
    expect(() => parseJws(token)).toThrow(
      expect.objectContaining({ code: "INVALID_CHAIN_LENGTH" })
    );
  });

  test("rejects a chain of four certificates", async () => {
    const chain = await validChain();
    const token = await signJws(chain, PAYLOAD, {
      x5c: [...chain.x5c, chain.x5c[2]],
    });
    expect(() => parseJws(token)).toThrow(
      expect.objectContaining({ code: "INVALID_CHAIN_LENGTH" })
    );
  });

  test("rejects an intermediate without Apple's developer-relations marker", async () => {
    const chain = await createTestChain({ omitWwdrOid: true });
    const parsed = parseJws(await signJws(chain, PAYLOAD));
    await expectCode(
      verifyJws(parsed, { at: SIGNED_DATE, roots: trustAnchorsFor(chain) }),
      "INVALID_CERTIFICATE"
    );
  });

  test("rejects a leaf without the receipt-signing marker", async () => {
    const chain = await createTestChain({ omitReceiptOid: true });
    const parsed = parseJws(await signJws(chain, PAYLOAD));
    await expectCode(
      verifyJws(parsed, { at: SIGNED_DATE, roots: trustAnchorsFor(chain) }),
      "INVALID_CERTIFICATE"
    );
  });

  test.each(["RS256", "ES384", "HS256", "none"])(
    "rejects the algorithm %s, so only ES256 is ever accepted",
    async (alg) => {
      const chain = await validChain();
      const token = await signJws(chain, PAYLOAD, { alg });
      expect(() => parseJws(token)).toThrow(
        expect.objectContaining({ code: "UNSUPPORTED_ALG" })
      );
    }
  );

  test("rejects a tampered signature", async () => {
    const chain = await validChain();
    const parsed = parseJws(
      await signJws(chain, PAYLOAD, { tamperSignature: true })
    );
    await expectCode(
      verifyJws(parsed, { at: SIGNED_DATE, roots: trustAnchorsFor(chain) }),
      "INVALID_SIGNATURE"
    );
  });

  test("rejects a payload edited after signing", async () => {
    const chain = await validChain();
    const parsed = parseJws(await signJws(chain, PAYLOAD, { tamperPayload: true }));
    expect(parsed.payload.tampered).toBe(true); // the edit is visible...
    await expectCode(
      verifyJws(parsed, { at: SIGNED_DATE, roots: trustAnchorsFor(chain) }),
      "INVALID_SIGNATURE"
    ); // ...and fatal
  });

  test("rejects a leaf whose curve contradicts the ES256 header", async () => {
    const chain = await createTestChain({ leafCurve: "P-384" });
    const parsed = parseJws(await signJws(chain, PAYLOAD));
    await expectCode(
      verifyJws(parsed, { at: SIGNED_DATE, roots: trustAnchorsFor(chain) }),
      "UNSUPPORTED_CERT_ALGORITHM"
    );
  });
});

describe("malformed input", () => {
  test.each([
    ["an empty string", ""],
    ["two segments", "aaa.bbb"],
    ["four segments", "aaa.bbb.ccc.ddd"],
    ["an empty segment", "aaa..ccc"],
  ])("rejects %s", (_label, token) => {
    expect(() => parseJws(token)).toThrow(
      expect.objectContaining({ code: "INVALID_JWS_FORMAT" })
    );
  });

  test("rejects a header that is not JSON", () => {
    expect(() => parseJws("bm90LWpzb24.e30.c2ln")).toThrow(
      expect.objectContaining({ code: "INVALID_JWS_FORMAT" })
    );
  });

  test("rejects a payload that is a JSON array rather than an object", async () => {
    const chain = await validChain();
    // Sign a real token, then swap its payload segment for an encoded array.
    const token = await signJws(chain, PAYLOAD);
    const [header, , signature] = token.split(".");
    expect(() => parseJws(`${header}.WzEsMiwzXQ.${signature}`)).toThrow(
      expect.objectContaining({ code: "INVALID_JWS_FORMAT" })
    );
  });

  test("rejects an implausibly large token before decoding it", () => {
    const huge = `${"a".repeat(200_000)}.b.c`;
    expect(() => parseJws(huge)).toThrow(
      expect.objectContaining({ code: "INVALID_JWS_FORMAT" })
    );
  });

  test("rejects a signature that is not 64 bytes", async () => {
    const chain = await validChain();
    const token = await signJws(chain, PAYLOAD);
    const [header, payload] = token.split(".");
    expect(() => parseJws(`${header}.${payload}.AAAA`)).toThrow(
      expect.objectContaining({ code: "INVALID_SIGNATURE" })
    );
  });
});
