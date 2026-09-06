/**
 * X.509 certificate parsing, narrowed to what chain validation needs.
 *
 * Reads six things out of a certificate and ignores the rest:
 * the signed bytes, the signature and its algorithm, the validity window, the
 * public key, the issuer and subject names, and which extensions are present.
 *
 * The signed bytes matter most. A certificate's signature covers the encoded
 * `tbsCertificate` exactly as the issuer wrote it, so this module hands back a
 * view of the original buffer. Re-encoding the parsed contents would be a bug:
 * DER is canonical in theory, and a signer's bytes are the only bytes that
 * verify in practice.
 *
 * @internal
 */
import {
  children,
  content,
  DerError,
  raw,
  readBitString,
  readNodeOfTag,
  readOid,
  readTime,
  Tag,
  type DerNode,
} from "./asn1.js";

/** Signature algorithm OIDs, and how each one must be verified. */
const SIGNATURE_ALGORITHMS: Record<
  string,
  { readonly name: string; readonly kind: "ecdsa" | "rsa"; readonly hash: string }
> = {
  "1.2.840.10045.4.3.2": { name: "ecdsa-with-SHA256", kind: "ecdsa", hash: "SHA-256" },
  "1.2.840.10045.4.3.3": { name: "ecdsa-with-SHA384", kind: "ecdsa", hash: "SHA-384" },
  "1.2.840.10045.4.3.4": { name: "ecdsa-with-SHA512", kind: "ecdsa", hash: "SHA-512" },
  "1.2.840.113549.1.1.5": { name: "sha1WithRSAEncryption", kind: "rsa", hash: "SHA-1" },
  "1.2.840.113549.1.1.11": { name: "sha256WithRSAEncryption", kind: "rsa", hash: "SHA-256" },
  "1.2.840.113549.1.1.12": { name: "sha384WithRSAEncryption", kind: "rsa", hash: "SHA-384" },
  "1.2.840.113549.1.1.13": { name: "sha512WithRSAEncryption", kind: "rsa", hash: "SHA-512" },
};

/** Elliptic-curve OIDs, mapped to the names WebCrypto expects. */
const CURVES: Record<string, "P-256" | "P-384" | "P-521"> = {
  "1.2.840.10045.3.1.7": "P-256",
  "1.3.132.0.34": "P-384",
  "1.3.132.0.35": "P-521",
};

const ID_EC_PUBLIC_KEY = "1.2.840.10045.2.1";

/** Apple's Worldwide Developer Relations marker, required on the intermediate. */
export const OID_APPLE_WWDR = "1.2.840.113635.100.6.2.1";

/**
 * Apple's receipt-signing marker, required on the leaf.
 *
 * Defined by the Apple WWDR Certification Practice Statement, §4.11.10.
 */
export const OID_APPLE_RECEIPT_SIGNING = "1.2.840.113635.100.6.11.1";

/** How a certificate's own signature must be checked. */
export interface SignatureAlgorithm {
  /** The algorithm's conventional name, for error messages. */
  readonly name: string;
  /** Which signature scheme the issuer used. */
  readonly kind: "ecdsa" | "rsa";
  /**
   * The digest to use.
   *
   * Taken from the certificate's own `signatureAlgorithm`, never inferred from
   * the issuer key's curve. Apple's chain mixes them — a P-384 root signs a
   * P-256 intermediate — and guessing the hash from the key is the exact
   * mistake that has broken other implementations.
   */
  readonly hash: string;
}

/** A certificate's public key, in the form WebCrypto imports. */
export interface PublicKeyInfo {
  /** The complete `SubjectPublicKeyInfo`, ready for `importKey("spki", ...)`. */
  readonly spki: Uint8Array;
  /** `"ec"` when the key is elliptic-curve, `"other"` for anything else (in practice RSA). */
  readonly kind: "ec" | "other";
  /** The named curve, when this is an EC key and the curve is one WebCrypto knows. */
  readonly curve?: "P-256" | "P-384" | "P-521";
  /** The key algorithm OID, for error messages. */
  readonly algorithmOid: string;
}

/** Everything chain validation reads out of one certificate. */
export interface Certificate {
  /** The certificate's complete DER encoding. */
  readonly der: Uint8Array;
  /** The exact `tbsCertificate` bytes the signature covers. */
  readonly tbs: Uint8Array;
  /** How this certificate's signature was made by its issuer. */
  readonly signatureAlgorithm: SignatureAlgorithm;
  /** The signature itself. For ECDSA this is a DER `SEQUENCE { r, s }`. */
  readonly signature: Uint8Array;
  /** The `issuer` Name, as raw DER, for byte-comparison against a candidate issuer's subject. */
  readonly issuerRaw: Uint8Array;
  /** The `subject` Name, as raw DER. */
  readonly subjectRaw: Uint8Array;
  /** Start of the validity window, in epoch milliseconds. */
  readonly notBefore: number;
  /** End of the validity window, in epoch milliseconds. */
  readonly notAfter: number;
  /** This certificate's public key. */
  readonly publicKey: PublicKeyInfo;
  /** Every extension OID present, so a marker check is a set lookup. */
  readonly extensionOids: ReadonlySet<string>;
}

function parseAlgorithmIdentifier(
  buf: Uint8Array,
  node: DerNode
): { oid: string; parametersOid?: string } {
  const parts = children(buf, node);
  if (parts.length === 0) throw new DerError("empty AlgorithmIdentifier");
  const oid = readOid(buf, parts[0]);
  let parametersOid: string | undefined;
  if (parts.length > 1 && parts[1].tag === Tag.OBJECT_IDENTIFIER) {
    parametersOid = readOid(buf, parts[1]);
  }
  return { oid, parametersOid };
}

function parsePublicKey(buf: Uint8Array, spkiNode: DerNode): PublicKeyInfo {
  const parts = children(buf, spkiNode);
  if (parts.length < 2) {
    throw new DerError("SubjectPublicKeyInfo needs an algorithm and a key");
  }
  const algorithm = parseAlgorithmIdentifier(
    buf,
    readNodeOfTag(buf, parts[0].start, Tag.SEQUENCE, "algorithm identifier")
  );

  // Force a copy: WebCrypto's importKey rejects a view whose byteOffset is not
  // zero in some runtimes, and this buffer is a window into the whole chain.
  const spki = raw(buf, spkiNode).slice();

  if (algorithm.oid !== ID_EC_PUBLIC_KEY) {
    return { spki, kind: "other", algorithmOid: algorithm.oid };
  }
  return {
    spki,
    kind: "ec",
    curve: algorithm.parametersOid ? CURVES[algorithm.parametersOid] : undefined,
    algorithmOid: algorithm.oid,
  };
}

function parseExtensionOids(buf: Uint8Array, extensionsWrapper: DerNode): Set<string> {
  const oids = new Set<string>();
  // [3] EXPLICIT wraps a single SEQUENCE OF Extension.
  const inner = children(buf, extensionsWrapper);
  if (inner.length === 0) return oids;
  for (const extension of children(buf, inner[0])) {
    const fields = children(buf, extension);
    if (fields.length === 0) continue;
    oids.add(readOid(buf, fields[0]));
  }
  return oids;
}

/**
 * Parses one DER-encoded certificate.
 *
 * @throws {DerError} when the input is not a well-formed certificate.
 */
export function parseCertificate(der: Uint8Array): Certificate {
  const certificate = readNodeOfTag(der, 0, Tag.SEQUENCE, "Certificate");
  const top = children(der, certificate);
  if (top.length !== 3) {
    throw new DerError(
      `Certificate must hold tbsCertificate, signatureAlgorithm and signatureValue; found ${top.length} fields`
    );
  }

  const [tbsNode, sigAlgNode, sigValueNode] = top;
  if (tbsNode.tag !== Tag.SEQUENCE) {
    throw new DerError("tbsCertificate is not a SEQUENCE");
  }

  const { oid: signatureOid } = parseAlgorithmIdentifier(der, sigAlgNode);
  const algorithm = SIGNATURE_ALGORITHMS[signatureOid];
  if (!algorithm) {
    throw new DerError(`unrecognised signature algorithm OID ${signatureOid}`);
  }

  const fields = children(der, tbsNode);
  let index = 0;

  // version is [0] EXPLICIT and defaults to v1, so it may be absent.
  if (fields[index] && fields[index].tag === 0xa0) index += 1;

  // serialNumber, then the inner signature AlgorithmIdentifier (which must
  // agree with the outer one, though nothing here depends on it).
  index += 1;
  index += 1;

  const issuerNode = fields[index];
  index += 1;
  const validityNode = fields[index];
  index += 1;
  const subjectNode = fields[index];
  index += 1;
  const spkiNode = fields[index];
  index += 1;

  if (!issuerNode || !validityNode || !subjectNode || !spkiNode) {
    throw new DerError("tbsCertificate is missing a required field");
  }

  const validityParts = children(der, validityNode);
  if (validityParts.length !== 2) {
    throw new DerError("Validity must hold notBefore and notAfter");
  }

  let extensionOids: ReadonlySet<string> = new Set<string>();
  for (let i = index; i < fields.length; i += 1) {
    if (fields[i].tag === 0xa3) {
      extensionOids = parseExtensionOids(der, fields[i]);
      break;
    }
  }

  return {
    der,
    tbs: raw(der, tbsNode),
    signatureAlgorithm: algorithm,
    signature: readBitString(der, sigValueNode).slice(),
    issuerRaw: raw(der, issuerNode),
    subjectRaw: raw(der, subjectNode),
    notBefore: readTime(der, validityParts[0]),
    notAfter: readTime(der, validityParts[1]),
    publicKey: parsePublicKey(der, spkiNode),
    extensionOids,
  };
}

/** Whether `at` (epoch milliseconds) falls inside the certificate's validity window. */
export function isValidAt(certificate: Certificate, at: number): boolean {
  return at >= certificate.notBefore && at <= certificate.notAfter;
}

// Re-exported so callers do not need to reach into asn1.ts for the content of
// a Name when logging a rejection.
export { content as derContent };
