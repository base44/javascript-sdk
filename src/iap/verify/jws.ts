/**
 * Compact JWS parsing and signature verification for Apple's signed tokens.
 *
 * A token is three base64url segments joined by dots. The header names the
 * algorithm and carries the certificate chain; the payload is JSON; the
 * signature covers the ASCII bytes of `header.payload` — the encoded text, not
 * a re-serialisation of the parsed JSON.
 *
 * @internal
 */
import {
  base64ToBytes,
  base64UrlToBytes,
  bytesToBase64Url,
} from "../runtime/base64.js";
import { utf8 } from "../runtime/webcrypto.js";
import { IapVerificationError } from "../errors.js";
import { verifyChain, APPLE_CHAIN_LENGTH, type VerifyChainOptions } from "./chain.js";
import { verifyRawEcdsa } from "./ecdsa.js";

/**
 * Size ceilings, so a hostile token is rejected before it is parsed.
 *
 * Real values sit orders of magnitude below these: an Apple transaction token
 * is a couple of kilobytes and a certificate is around 1.5 KB. The point is
 * only to stop an attacker handing a public webhook a megabyte of base64 to
 * decode and walk.
 */
const MAX_TOKEN_BYTES = 128 * 1024;
const MAX_HEADER_BYTES = 16 * 1024;
const MAX_CERTIFICATE_BYTES = 8 * 1024;

/** The one algorithm Apple's tokens use, and the only one accepted. */
const REQUIRED_ALG = "ES256";

/** The decoded JWS header. */
export interface JwsHeader {
  readonly alg: string;
  readonly x5c: readonly string[];
}

/** A parsed but not yet verified token. */
export interface ParsedJws {
  readonly header: JwsHeader;
  /** The certificates from `x5c`, decoded, leaf first. */
  readonly chain: readonly Uint8Array[];
  /** The payload, parsed from JSON with every field preserved. */
  readonly payload: Record<string, unknown>;
  /** ASCII bytes of `header.payload` — exactly what the signature covers. */
  readonly signingInput: Uint8Array;
  /** The raw `r ‖ s` signature. */
  readonly signature: Uint8Array;
}

function decodeJsonSegment(segment: string, what: string): Record<string, unknown> {
  let text: string;
  try {
    const bytes = base64UrlToBytes(segment);
    // Decoding by hand rather than with TextDecoder keeps the runtime surface
    // to what webcrypto.ts already guards, and these payloads are JSON, so
    // every byte outside ASCII arrives inside a string literal as an escape or
    // as UTF-8 that JSON.parse handles from the raw code units.
    text = new TextDecoder().decode(bytes);
  } catch (cause) {
    throw new IapVerificationError(
      "INVALID_JWS_FORMAT",
      `the JWS ${what} is not valid base64url`,
      { cause }
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (cause) {
    throw new IapVerificationError(
      "INVALID_JWS_FORMAT",
      `the JWS ${what} is not valid JSON`,
      { cause }
    );
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new IapVerificationError(
      "INVALID_JWS_FORMAT",
      `the JWS ${what} is not a JSON object`
    );
  }
  return parsed as Record<string, unknown>;
}

/**
 * Splits and decodes a compact JWS without verifying anything.
 *
 * The result is untrusted. Nothing may act on it beyond deciding *how* to
 * verify it.
 */
export function parseJws(token: string): ParsedJws {
  if (typeof token !== "string" || token.length === 0) {
    throw new IapVerificationError("INVALID_JWS_FORMAT", "the token is empty");
  }
  if (token.length > MAX_TOKEN_BYTES) {
    throw new IapVerificationError(
      "INVALID_JWS_FORMAT",
      `the token is ${token.length} bytes, over the ${MAX_TOKEN_BYTES}-byte ceiling`
    );
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new IapVerificationError(
      "INVALID_JWS_FORMAT",
      `a compact JWS has three dot-separated segments; found ${parts.length}`
    );
  }
  const [headerSegment, payloadSegment, signatureSegment] = parts;
  if (!headerSegment || !payloadSegment || !signatureSegment) {
    throw new IapVerificationError(
      "INVALID_JWS_FORMAT",
      "a compact JWS segment is empty"
    );
  }
  if (headerSegment.length > MAX_HEADER_BYTES) {
    throw new IapVerificationError(
      "INVALID_JWS_FORMAT",
      "the JWS header is implausibly large"
    );
  }

  const rawHeader = decodeJsonSegment(headerSegment, "header");

  const alg = rawHeader.alg;
  if (typeof alg !== "string") {
    throw new IapVerificationError(
      "INVALID_JWS_FORMAT",
      "the JWS header has no 'alg'"
    );
  }
  // Apple's notification documentation never names the algorithm; the App
  // Store Server API and Apple's own library both use ES256, so that is what
  // is required. Accepting anything else here would accept `alg: "none"`.
  if (alg !== REQUIRED_ALG) {
    throw new IapVerificationError(
      "UNSUPPORTED_ALG",
      `the JWS header names algorithm ${JSON.stringify(alg)}; only ${REQUIRED_ALG} is accepted`
    );
  }

  const x5c = rawHeader.x5c;
  if (!Array.isArray(x5c)) {
    throw new IapVerificationError(
      "INVALID_CHAIN_LENGTH",
      "the JWS header has no 'x5c' certificate chain"
    );
  }
  if (x5c.length !== APPLE_CHAIN_LENGTH) {
    throw new IapVerificationError(
      "INVALID_CHAIN_LENGTH",
      `expected ${APPLE_CHAIN_LENGTH} certificates in the x5c header, found ${x5c.length}`
    );
  }

  const chain: Uint8Array[] = [];
  for (let i = 0; i < x5c.length; i += 1) {
    const entry = x5c[i];
    if (typeof entry !== "string") {
      throw new IapVerificationError(
        "INVALID_CERTIFICATE",
        `x5c entry ${i} is not a string`
      );
    }
    // x5c entries are standard base64, not base64url, even though the segments
    // around them are base64url. The shared decoder takes both.
    let der: Uint8Array;
    try {
      der = base64ToBytes(entry);
    } catch (cause) {
      throw new IapVerificationError(
        "INVALID_CERTIFICATE",
        `x5c entry ${i} is not valid base64`,
        { cause }
      );
    }
    if (der.length === 0 || der.length > MAX_CERTIFICATE_BYTES) {
      throw new IapVerificationError(
        "INVALID_CERTIFICATE",
        `x5c entry ${i} is ${der.length} bytes, outside the plausible range`
      );
    }
    chain.push(der);
  }

  let signature: Uint8Array;
  try {
    signature = base64UrlToBytes(signatureSegment);
  } catch (cause) {
    throw new IapVerificationError(
      "INVALID_JWS_FORMAT",
      "the JWS signature is not valid base64url",
      { cause }
    );
  }
  // ES256 is two 32-byte scalars. Unlike a certificate signature this is
  // already raw, so it must NOT go through the DER converter.
  if (signature.length !== 64) {
    throw new IapVerificationError(
      "INVALID_SIGNATURE",
      `an ES256 signature is 64 bytes; found ${signature.length}`
    );
  }

  return {
    header: { alg, x5c: x5c as readonly string[] },
    chain,
    payload: decodeJsonSegment(payloadSegment, "payload"),
    signingInput: utf8(`${headerSegment}.${payloadSegment}`),
    signature,
  };
}

/** Inputs to {@link verifyJws}. */
export interface VerifyJwsOptions {
  /** The instant to evaluate certificate validity at. Normally the payload's `signedDate`. */
  readonly at: number;
  /** Trust anchors. Defaults to Apple's pinned roots. @internal */
  readonly roots?: VerifyChainOptions["roots"];
}

/**
 * Verifies a parsed token's chain and signature.
 *
 * @throws {IapVerificationError} on any failure.
 */
export async function verifyJws(
  parsed: ParsedJws,
  options: VerifyJwsOptions
): Promise<void> {
  const { leaf } = await verifyChain(parsed.chain, {
    at: options.at,
    roots: options.roots,
  });

  // ES256 pins the curve as well as the digest, so a leaf on any other curve
  // means the header and the certificate disagree.
  if (leaf.publicKey.kind !== "ec" || leaf.publicKey.curve !== "P-256") {
    throw new IapVerificationError(
      "UNSUPPORTED_CERT_ALGORITHM",
      `the header names ES256 but the leaf certificate's key is ` +
        `${leaf.publicKey.curve ?? leaf.publicKey.algorithmOid}, not P-256`
    );
  }

  const ok = await verifyRawEcdsa(
    leaf.publicKey.spki,
    "P-256",
    "SHA-256",
    parsed.signature,
    parsed.signingInput
  );
  if (!ok) {
    throw new IapVerificationError(
      "INVALID_SIGNATURE",
      "the token's signature does not verify against its leaf certificate"
    );
  }
}

// Exported for the test fixtures, which build tokens rather than read them.
export { bytesToBase64Url as encodeBase64Url };
