import { describe, expect, test } from "vitest";
import {
  base64ToBytes,
  bytesEqual,
  bytesToBase64,
  bytesToBase64Url,
  base64UrlToBytes,
  Base64DecodeError,
} from "../../src/iap/runtime/base64.ts";
import { DerError, readNode, Tag } from "../../src/iap/verify/asn1.ts";
import {
  isValidAt,
  OID_APPLE_WWDR,
  parseCertificate,
} from "../../src/iap/verify/x509.ts";
import { derSignatureToRaw, verifyRawEcdsa } from "../../src/iap/verify/ecdsa.ts";
import { appleRoots } from "../../src/iap/verify/apple-roots.ts";

describe("base64 codec", () => {
  test("round-trips every byte value, so no alphabet entry is transposed", () => {
    const all = new Uint8Array(256);
    for (let i = 0; i < 256; i += 1) all[i] = i;
    expect(bytesEqual(base64ToBytes(bytesToBase64(all)), all)).toBe(true);
    expect(bytesEqual(base64UrlToBytes(bytesToBase64Url(all)), all)).toBe(true);
  });

  test.each([0, 1, 2, 3, 4, 5, 17])(
    "round-trips a %i-byte input, so padding arithmetic is right at every remainder",
    (length) => {
      const bytes = new Uint8Array(length).map((_, i) => (i * 37) & 0xff);
      expect(bytesEqual(base64ToBytes(bytesToBase64(bytes)), bytes)).toBe(true);
      expect(bytesEqual(base64ToBytes(bytesToBase64Url(bytes)), bytes)).toBe(true);
    }
  );

  test("decodes both alphabets, because one JWS carries base64url and standard base64 together", () => {
    // 0xfb 0xff encodes as "+/8" in standard and "-_8" in URL-safe.
    const standard = base64ToBytes("+/8=");
    const urlSafe = base64ToBytes("-_8=");
    expect(bytesEqual(standard, urlSafe)).toBe(true);
    expect(Array.from(standard)).toEqual([251, 255]);
  });

  test("ignores line wrapping, so a wrapped certificate constant decodes as-is", () => {
    expect(Array.from(base64ToBytes("AQID"))).toEqual([1, 2, 3]);
    expect(Array.from(base64ToBytes("AQ\nID\r\n"))).toEqual([1, 2, 3]);
  });

  test("rejects a single trailing character, which encodes no whole byte", () => {
    expect(() => base64ToBytes("AAAAA")).toThrow(Base64DecodeError);
  });

  test("rejects a character outside both alphabets instead of skipping it", () => {
    expect(() => base64ToBytes("AA*A")).toThrow(Base64DecodeError);
  });

  test("bytesEqual compares contents, not identity", () => {
    expect(bytesEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2]))).toBe(true);
    expect(bytesEqual(new Uint8Array([1, 2]), new Uint8Array([1, 3]))).toBe(false);
    expect(bytesEqual(new Uint8Array([1]), new Uint8Array([1, 2]))).toBe(false);
  });
});

describe("DER reader", () => {
  test("reads a short-form node", () => {
    const node = readNode(new Uint8Array([0x02, 0x01, 0x05]), 0);
    expect(node).toMatchObject({ tag: Tag.INTEGER, length: 1, contentStart: 2, end: 3 });
  });

  test("reads a long-form length", () => {
    const buf = new Uint8Array(4 + 300);
    buf[0] = 0x04;
    buf[1] = 0x82;
    buf[2] = 0x01;
    buf[3] = 0x2c; // 300
    expect(readNode(buf, 0).length).toBe(300);
  });

  test("rejects indefinite length, which is BER and not DER", () => {
    expect(() => readNode(new Uint8Array([0x30, 0x80, 0x00, 0x00]), 0)).toThrow(
      /indefinite length/
    );
  });

  test("rejects a length that runs past the buffer instead of clamping it", () => {
    expect(() => readNode(new Uint8Array([0x04, 0x10, 0x00]), 0)).toThrow(/truncated/);
  });

  test("rejects a truncated header", () => {
    expect(() => readNode(new Uint8Array([0x04]), 0)).toThrow(DerError);
  });
});

describe("Apple root certificates", () => {
  test("all three roots are pinned, and only the ECDSA one is verifiable in v1", () => {
    const roots = appleRoots();
    expect(roots.map((r) => r.name)).toEqual([
      "Apple Root CA - G3",
      "Apple Root CA - G2",
      "Apple Inc. Root",
    ]);
    expect(roots.map((r) => r.der.length)).toEqual([583, 1430, 1215]);
    expect(roots.map((r) => r.supported)).toEqual([true, false, false]);
  });

  test("appleRoots() is memoized, so a hot function pays the parse once", () => {
    expect(appleRoots()).toBe(appleRoots());
  });

  test("parses Apple Root CA - G3 into the values openssl reports for it", () => {
    const g3 = parseCertificate(appleRoots()[0].der);

    // Self-signed: the issuer and subject names are byte-identical.
    expect(bytesEqual(g3.issuerRaw, g3.subjectRaw)).toBe(true);

    expect(g3.signatureAlgorithm).toEqual({
      name: "ecdsa-with-SHA384",
      kind: "ecdsa",
      hash: "SHA-384",
    });
    expect(g3.publicKey.kind).toBe("ec");
    expect(g3.publicKey.curve).toBe("P-384");

    expect(new Date(g3.notBefore).toISOString()).toBe("2014-04-30T18:19:06.000Z");
    expect(new Date(g3.notAfter).toISOString()).toBe("2039-04-30T18:19:06.000Z");
    expect(isValidAt(g3, Date.UTC(2026, 0, 1))).toBe(true);
    expect(isValidAt(g3, Date.UTC(2013, 0, 1))).toBe(false);
    expect(isValidAt(g3, Date.UTC(2040, 0, 1))).toBe(false);

    // The root is a CA, so it carries basicConstraints and keyUsage but not
    // Apple's WWDR marker — that lives on the intermediate.
    expect(g3.extensionOids.has("2.5.29.19")).toBe(true);
    expect(g3.extensionOids.has("2.5.29.15")).toBe(true);
    expect(g3.extensionOids.has(OID_APPLE_WWDR)).toBe(false);
  });

  test("verifies Apple Root CA - G3's own signature, end to end on real Apple bytes", async () => {
    const g3 = parseCertificate(appleRoots()[0].der);
    const raw = derSignatureToRaw(g3.signature, "P-384");
    expect(raw.length).toBe(96); // two 48-byte scalars

    const verified = await verifyRawEcdsa(
      g3.publicKey.spki,
      "P-384",
      g3.signatureAlgorithm.hash,
      raw,
      g3.tbs
    );
    expect(verified).toBe(true);
  });

  test("rejects the same signature over tampered bytes", async () => {
    const g3 = parseCertificate(appleRoots()[0].der);
    const tampered = g3.tbs.slice();
    tampered[tampered.length - 1] ^= 0x01;

    const verified = await verifyRawEcdsa(
      g3.publicKey.spki,
      "P-384",
      g3.signatureAlgorithm.hash,
      derSignatureToRaw(g3.signature, "P-384"),
      tampered
    );
    expect(verified).toBe(false);
  });

  test("rejects a signature checked with the wrong digest, so the hash cannot be guessed", async () => {
    const g3 = parseCertificate(appleRoots()[0].der);
    const verified = await verifyRawEcdsa(
      g3.publicKey.spki,
      "P-384",
      "SHA-256", // the certificate says SHA-384
      derSignatureToRaw(g3.signature, "P-384"),
      g3.tbs
    );
    expect(verified).toBe(false);
  });

  test("parses the RSA roots but marks their keys as ones v1 cannot verify", () => {
    for (const root of appleRoots().slice(1)) {
      const parsed = parseCertificate(root.der);
      expect(parsed.publicKey.kind).toBe("other");
      expect(parsed.publicKey.curve).toBeUndefined();
      expect(parsed.signatureAlgorithm.kind).toBe("rsa");
    }
  });
});

describe("ECDSA signature conversion", () => {
  test("left-pads both scalars to the curve width", () => {
    // SEQUENCE { INTEGER 0x01, INTEGER 0x02 } — both one byte, both need padding.
    const der = new Uint8Array([0x30, 0x06, 0x02, 0x01, 0x01, 0x02, 0x01, 0x02]);
    const raw = derSignatureToRaw(der, "P-256");
    expect(raw.length).toBe(64);
    expect(raw[31]).toBe(0x01);
    expect(raw[63]).toBe(0x02);
    expect(raw[0]).toBe(0x00);
    expect(raw[32]).toBe(0x00);
  });

  test("strips DER's sign byte rather than treating it as data", () => {
    // INTEGER 0x00ff is the DER encoding of the unsigned value 255.
    const der = new Uint8Array([
      0x30, 0x08, 0x02, 0x02, 0x00, 0xff, 0x02, 0x02, 0x00, 0xfe,
    ]);
    const raw = derSignatureToRaw(der, "P-256");
    expect(raw[31]).toBe(0xff);
    expect(raw[30]).toBe(0x00);
    expect(raw[63]).toBe(0xfe);
  });

  test("rejects a sequence that is not exactly two integers", () => {
    const der = new Uint8Array([0x30, 0x03, 0x02, 0x01, 0x01]);
    expect(() => derSignatureToRaw(der, "P-256")).toThrow(/exactly r and s/);
  });

  test("rejects a scalar wider than the curve", () => {
    const wide = new Uint8Array(33).fill(0x11);
    const der = new Uint8Array([
      0x30, 0x25, 0x02, 0x21, ...wide, 0x02, 0x01, 0x02,
    ]);
    expect(() => derSignatureToRaw(der, "P-256")).toThrow(/wider than/);
  });
});
