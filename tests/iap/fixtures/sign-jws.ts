// Mints compact JWS tokens signed by a test chain's leaf key.
//
// The signing input is the ASCII of `header.payload`, and an ES256 signature is
// raw `r ‖ s` — which is what WebCrypto's ECDSA sign already returns, so no DER
// conversion happens here. That asymmetry against certificate signatures is
// the thing these fixtures exist to exercise.
import {
  bytesToBase64,
  bytesToBase64Url,
} from "../../../src/iap/runtime/base64.ts";
import type { TestChain } from "./test-chain.ts";

function encodeJson(value: unknown): string {
  const json = JSON.stringify(value);
  const bytes = new TextEncoder().encode(json);
  return bytesToBase64Url(bytes);
}

/** Overrides for a minted token's header. */
export interface SignJwsOptions {
  /** Replace the `alg` claim, to test rejection. */
  readonly alg?: string;
  /** Replace the `x5c` chain, e.g. with a truncated one. */
  readonly x5c?: readonly Uint8Array[];
  /** Corrupt the signature after signing. */
  readonly tamperSignature?: boolean;
  /** Corrupt the payload after signing, leaving the signature intact. */
  readonly tamperPayload?: boolean;
}

/** Signs `payload` into a compact JWS using `chain`'s leaf key. */
export async function signJws(
  chain: TestChain,
  payload: Record<string, unknown>,
  options: SignJwsOptions = {}
): Promise<string> {
  const x5c = (options.x5c ?? chain.x5c).map((der) => bytesToBase64(der));
  const header = encodeJson({ alg: options.alg ?? "ES256", x5c });
  const body = encodeJson(payload);

  const signingInput = new TextEncoder().encode(`${header}.${body}`);
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      chain.leafPrivateKey,
      signingInput
    )
  );

  if (options.tamperSignature) signature[0] ^= 0xff;

  const encodedBody = options.tamperPayload
    ? encodeJson({ ...payload, tampered: true })
    : body;

  return `${header}.${encodedBody}.${bytesToBase64Url(signature)}`;
}
