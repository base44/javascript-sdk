/**
 * ECDSA verification over WebCrypto.
 *
 * The whole reason this file exists is an encoding mismatch. ECDSA signatures
 * appear in two shapes and both turn up in one Apple token:
 *
 * - Inside a **certificate**, the signature is a DER `SEQUENCE { r, s }`.
 * - Inside a **JWS**, it is raw fixed-width `r ‖ s`.
 *
 * WebCrypto only accepts the second. So a certificate signature must be
 * converted, and a JWS signature must not be. Getting this backwards fails
 * every verification, which is the good failure; the bad one is padding `r`
 * and `s` to the wrong width, which fails only for the fraction of signatures
 * whose leading byte happens to be zero.
 *
 * @internal
 */
import { children, DerError, readNodeOfTag, readUnsignedInteger, Tag } from "./asn1.js";
import { getSubtle } from "../runtime/webcrypto.js";

/** Byte width of one ECDSA scalar for each curve WebCrypto supports. */
const SCALAR_BYTES: Record<"P-256" | "P-384" | "P-521", number> = {
  "P-256": 32,
  "P-384": 48,
  "P-521": 66,
};

/**
 * Converts a DER `ECDSA-Sig-Value` into the raw `r ‖ s` form WebCrypto wants.
 *
 * Each scalar is left-padded to the curve's fixed width. DER stores integers
 * with leading zeros stripped and a sign byte added where needed, so the two
 * halves are almost never already the right length.
 */
export function derSignatureToRaw(
  derSignature: Uint8Array,
  curve: "P-256" | "P-384" | "P-521"
): Uint8Array {
  const width = SCALAR_BYTES[curve];
  const sequence = readNodeOfTag(derSignature, 0, Tag.SEQUENCE, "ECDSA-Sig-Value");
  const parts = children(derSignature, sequence);
  if (parts.length !== 2) {
    throw new DerError(
      `ECDSA-Sig-Value must hold exactly r and s; found ${parts.length} integers`
    );
  }

  const out = new Uint8Array(width * 2);
  for (let i = 0; i < 2; i += 1) {
    const scalar = readUnsignedInteger(derSignature, parts[i]);
    if (scalar.length > width) {
      throw new DerError(
        `ECDSA scalar is ${scalar.length} bytes, wider than ${curve}'s ${width}`
      );
    }
    out.set(scalar, width * (i + 1) - scalar.length);
  }
  return out;
}

/**
 * Verifies a raw `r ‖ s` ECDSA signature over `data`.
 *
 * @param spki - The signer's `SubjectPublicKeyInfo` in DER.
 * @param curve - The signer key's named curve.
 * @param hash - The digest named by the **signature algorithm**, not inferred from the curve.
 */
export async function verifyRawEcdsa(
  spki: Uint8Array,
  curve: "P-256" | "P-384" | "P-521",
  hash: string,
  signature: Uint8Array,
  data: Uint8Array
): Promise<boolean> {
  const subtle = getSubtle();
  let key: CryptoKey;
  try {
    key = await subtle.importKey(
      "spki",
      toArrayBuffer(spki),
      { name: "ECDSA", namedCurve: curve },
      false,
      ["verify"]
    );
  } catch {
    // A key this runtime will not import is not a key we can trust anything to.
    return false;
  }

  try {
    return await subtle.verify(
      { name: "ECDSA", hash: { name: hash } },
      key,
      toArrayBuffer(signature),
      toArrayBuffer(data)
    );
  } catch {
    return false;
  }
}

/**
 * Copies a view into a standalone `ArrayBuffer`.
 *
 * Every byte array in this module is a window into a larger buffer. Passing
 * one straight to WebCrypto is a correctness hazard: a `Uint8Array` with a
 * non-zero `byteOffset` is read from the wrong place by some implementations,
 * which produces a verification *failure* rather than an error.
 */
function toArrayBuffer(view: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(view.length);
  copy.set(view);
  return copy.buffer;
}
