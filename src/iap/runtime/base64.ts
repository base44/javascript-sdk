/**
 * Base64 and base64url codecs, hand-rolled.
 *
 * Deliberately does not use `atob`/`btoa` or `Buffer`:
 * - `Buffer` does not exist in Deno or the browser.
 * - `atob` returns a binary *string*, which is easy to corrupt on the way to
 *   bytes, and Node's implementation is deprecated.
 *
 * Everything in this module is total: it either returns bytes or throws. The
 * decoder accepts both alphabets, because a compact JWS is base64url while an
 * `x5c` entry inside its header is standard base64 — the same token carries
 * both.
 *
 * @internal
 */

const STANDARD =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const URLSAFE =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

// One shared reverse table for both alphabets: `-`/`_` and `+`/`/` all decode.
// 255 marks "not a base64 character" so a single comparison rejects garbage.
const REVERSE = (() => {
  const table = new Uint8Array(128).fill(255);
  for (let i = 0; i < STANDARD.length; i += 1) {
    table[STANDARD.charCodeAt(i)] = i;
    table[URLSAFE.charCodeAt(i)] = i;
  }
  return table;
})();

/** Thrown for input that is not valid base64 in either alphabet. */
export class Base64DecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Base64DecodeError";
  }
}

/**
 * Decodes standard or URL-safe base64 into bytes.
 *
 * Padding is optional. ASCII whitespace is ignored, so a PEM body or a
 * line-wrapped certificate constant decodes without pre-processing.
 */
export function base64ToBytes(input: string): Uint8Array {
  // Collect the 6-bit groups first so whitespace and padding never affect the
  // length arithmetic below.
  const sextets = new Uint8Array(input.length);
  let count = 0;

  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);

    // Whitespace is skipped; `=` ends the meaningful data.
    if (code === 32 || code === 9 || code === 10 || code === 13) continue;
    if (code === 61) break;

    const value = code < 128 ? REVERSE[code] : 255;
    if (value === 255) {
      throw new Base64DecodeError(
        `invalid base64 character at index ${i}: ${JSON.stringify(input[i])}`
      );
    }
    sextets[count] = value;
    count += 1;
  }

  // 4 base64 characters carry 3 bytes. A remainder of 1 is impossible: it would
  // mean 6 dangling bits, which encode no whole byte.
  const remainder = count % 4;
  if (remainder === 1) {
    throw new Base64DecodeError(
      "invalid base64 length: a single trailing character encodes no byte"
    );
  }

  const byteLength = Math.floor((count * 6) / 8);
  const out = new Uint8Array(byteLength);

  let accumulator = 0;
  let bits = 0;
  let written = 0;

  for (let i = 0; i < count; i += 1) {
    accumulator = (accumulator << 6) | sextets[i];
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[written] = (accumulator >> bits) & 0xff;
      written += 1;
    }
  }

  return out;
}

/** Decodes base64url. An alias for {@link base64ToBytes}, kept for call-site clarity. */
export function base64UrlToBytes(input: string): Uint8Array {
  return base64ToBytes(input);
}

function bytesToBase64Internal(bytes: Uint8Array, alphabet: string, pad: boolean): string {
  let out = "";
  let i = 0;

  for (; i + 2 < bytes.length; i += 3) {
    const triple = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out +=
      alphabet[(triple >> 18) & 63] +
      alphabet[(triple >> 12) & 63] +
      alphabet[(triple >> 6) & 63] +
      alphabet[triple & 63];
  }

  const left = bytes.length - i;
  if (left === 1) {
    const chunk = bytes[i] << 16;
    out += alphabet[(chunk >> 18) & 63] + alphabet[(chunk >> 12) & 63];
    if (pad) out += "==";
  } else if (left === 2) {
    const chunk = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out +=
      alphabet[(chunk >> 18) & 63] +
      alphabet[(chunk >> 12) & 63] +
      alphabet[(chunk >> 6) & 63];
    if (pad) out += "=";
  }

  return out;
}

/** Encodes bytes as standard, padded base64. */
export function bytesToBase64(bytes: Uint8Array): string {
  return bytesToBase64Internal(bytes, STANDARD, true);
}

/** Encodes bytes as unpadded base64url, the form JWS uses. */
export function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64Internal(bytes, URLSAFE, false);
}

/** Constant-time-ish byte comparison. Used for the Apple root pin. */
export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}
