import { describe, expect, test } from "vitest";
import {
  base64ToBytes,
  bytesEqual,
  bytesToBase64,
  bytesToBase64Url,
  base64UrlToBytes,
  Base64DecodeError,
} from "../../src/iap/runtime/base64.ts";
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

});
