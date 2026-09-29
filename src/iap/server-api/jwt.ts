/**
 * Signing the token the App Store Server API needs.
 *
 * A short-lived ES256 JWT, made from the In-App Purchase key. Two details are
 * easy to get wrong:
 *
 * - The `.p8` file is PEM-armoured PKCS#8, so the armour comes off before
 *   WebCrypto will import it.
 * - A JOSE signature is raw `r ‖ s`, which is exactly what WebCrypto's ECDSA
 *   sign returns — so unlike a certificate signature it needs **no** DER
 *   conversion. Doing one anyway produces a token Apple rejects.
 *
 * A fresh token is minted per request with a five-minute life, matching what
 * Apple's own library does. Apple's ceiling is 60 minutes.
 *
 * @internal
 */
import { base64ToBytes, bytesToBase64Url } from "../runtime/base64.js";
import { getSubtle, utf8 } from "../runtime/webcrypto.js";
import { IapConfigError } from "../errors.js";
import type { IapServerApiConfig } from "./server-api.types.js";

/** How long a minted token lasts. Apple allows up to 60 minutes. */
const TOKEN_LIFETIME_SECONDS = 5 * 60;

/** The audience Apple requires. */
const AUDIENCE = "appstoreconnect-v1";

function stripPemArmour(pem: string): string {
  return pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
}

async function importSigningKey(privateKeyP8: string): Promise<CryptoKey> {
  let der: Uint8Array;
  try {
    der = base64ToBytes(stripPemArmour(privateKeyP8));
  } catch (cause) {
    throw new IapConfigError(
      "IAP_INVALID_CONFIG",
      "the In-App Purchase private key is not valid base64. Pass the whole .p8 " +
        "file contents, including its BEGIN and END lines.",
      { cause }
    );
  }

  const copy = new Uint8Array(der.length);
  copy.set(der);

  try {
    return await getSubtle().importKey(
      "pkcs8",
      copy.buffer,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"]
    );
  } catch (cause) {
    throw new IapConfigError(
      "IAP_INVALID_CONFIG",
      "the In-App Purchase private key could not be read as a P-256 key. Check it " +
        "is the In-App Purchase key from App Store Connect, not an App Store " +
        "Connect team key.",
      { cause }
    );
  }
}

/** Mints a bearer token for the App Store Server API. */
export async function mintServerApiToken(
  config: IapServerApiConfig,
  bundleId: string,
  nowMs: number
): Promise<string> {
  const key = await importSigningKey(config.privateKeyP8);
  const issuedAt = Math.floor(nowMs / 1000);

  const header = bytesToBase64Url(
    utf8(JSON.stringify({ alg: "ES256", kid: config.keyId, typ: "JWT" }))
  );
  const payload = bytesToBase64Url(
    utf8(
      JSON.stringify({
        iss: config.issuerId,
        iat: issuedAt,
        exp: issuedAt + TOKEN_LIFETIME_SECONDS,
        aud: AUDIENCE,
        bid: bundleId,
      })
    )
  );

  const signingInput = utf8(`${header}.${payload}`);
  const input = new Uint8Array(signingInput.length);
  input.set(signingInput);

  const signature = await getSubtle().sign(
    { name: "ECDSA", hash: { name: "SHA-256" } },
    key,
    input.buffer
  );

  // Already raw r ‖ s. This must NOT go through the DER converter that
  // certificate signatures need.
  return `${header}.${payload}.${bytesToBase64Url(new Uint8Array(signature))}`;
}
