/**
 * Certificate-chain validation for Apple's signed tokens.
 *
 * Apple's instruction (WWDC23 session 10143) is to "construct a chain of trust
 * back to a known trusted source, in this case, an Apple root certificate
 * authority". This implements that literally, and adds the one thing that
 * makes it a pin rather than a suggestion: the root offered by the token must
 * be **byte-identical** to a root shipped inside this SDK.
 *
 * Checks run cheapest-first, so a token from the wrong signer is rejected
 * before any cryptography happens.
 *
 * @internal
 */
import { bytesEqual } from "../runtime/base64.js";
import { IapVerificationError } from "../errors.js";
import { appleRoots, type AppleRoot } from "./apple-roots.js";
import { derSignatureToRaw, verifyRawEcdsa } from "./ecdsa.js";
import {
  isValidAt,
  OID_APPLE_RECEIPT_SIGNING,
  OID_APPLE_WWDR,
  parseCertificate,
  type Certificate,
} from "./x509.js";

/** How many certificates Apple puts in an `x5c` header. */
export const APPLE_CHAIN_LENGTH = 3;

/** Inputs to {@link verifyChain}. */
export interface VerifyChainOptions {
  /**
   * The instant to evaluate certificate validity at.
   *
   * With offline checks — the only mode v1 supports — this is the payload's own
   * `signedDate`, matching Apple's library. That choice is what lets a
   * captured payload stay verifiable forever, which in turn is what makes
   * stored raw tokens a usable source of truth.
   */
  readonly at: number;
  /**
   * Trust anchors to pin against. Defaults to Apple's real roots.
   *
   * Overridden only by this module's own tests, which mint a throwaway chain.
   * It is deliberately not reachable from `IapConfig`: an app must never be
   * able to add a root.
   */
  readonly roots?: readonly AppleRoot[];
}

/** A validated chain. */
export interface VerifiedChain {
  /** The leaf certificate, whose key signed the token itself. */
  readonly leaf: Certificate;
  /** The intermediate that issued the leaf. */
  readonly intermediate: Certificate;
  /** The pinned root the chain terminated at. */
  readonly root: AppleRoot;
}

function parseOrReject(der: Uint8Array, role: string): Certificate {
  try {
    return parseCertificate(der);
  } catch (cause) {
    throw new IapVerificationError(
      "INVALID_CERTIFICATE",
      `the ${role} certificate could not be parsed: ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
      { cause }
    );
  }
}

async function requireSignedBy(
  subject: Certificate,
  issuer: Certificate,
  subjectRole: string,
  issuerRole: string
): Promise<void> {
  // A chain link is only a link if the names line up. Comparing the raw DER of
  // the two Names rather than a decoded string avoids every canonicalisation
  // question about character sets and attribute ordering.
  if (!bytesEqual(subject.issuerRaw, issuer.subjectRaw)) {
    throw new IapVerificationError(
      "INVALID_CERTIFICATE",
      `the ${subjectRole} certificate's issuer does not match the ${issuerRole} certificate's subject`
    );
  }

  if (subject.signatureAlgorithm.kind !== "ecdsa") {
    throw new IapVerificationError(
      "UNSUPPORTED_CERT_ALGORITHM",
      `the ${subjectRole} certificate is signed with ${subject.signatureAlgorithm.name}; ` +
        "this SDK verifies ECDSA signatures only"
    );
  }
  if (issuer.publicKey.kind !== "ec" || !issuer.publicKey.curve) {
    throw new IapVerificationError(
      "UNSUPPORTED_CERT_ALGORITHM",
      `the ${issuerRole} certificate's key (${issuer.publicKey.algorithmOid}) is not an ` +
        "elliptic-curve key on a supported curve; this SDK verifies ECDSA signatures only"
    );
  }

  let raw: Uint8Array;
  try {
    raw = derSignatureToRaw(subject.signature, issuer.publicKey.curve);
  } catch (cause) {
    throw new IapVerificationError(
      "INVALID_SIGNATURE",
      `the ${subjectRole} certificate's signature is not a well-formed ECDSA value`,
      { cause }
    );
  }

  // The digest comes from the subject certificate's own signatureAlgorithm.
  // Deriving it from the issuer key's curve instead is the mistake that breaks
  // Apple's chain specifically, because a P-384 root signs a P-256 intermediate.
  const ok = await verifyRawEcdsa(
    issuer.publicKey.spki,
    issuer.publicKey.curve,
    subject.signatureAlgorithm.hash,
    raw,
    subject.tbs
  );
  if (!ok) {
    throw new IapVerificationError(
      "INVALID_SIGNATURE",
      `the ${subjectRole} certificate is not signed by the ${issuerRole} certificate`
    );
  }
}

/**
 * Validates a three-certificate Apple chain and returns the leaf.
 *
 * @param x5c - The certificates from the JWS header, leaf first.
 * @throws {IapVerificationError} on any failure. There is no partial success.
 */
export async function verifyChain(
  x5c: readonly Uint8Array[],
  options: VerifyChainOptions
): Promise<VerifiedChain> {
  if (x5c.length !== APPLE_CHAIN_LENGTH) {
    throw new IapVerificationError(
      "INVALID_CHAIN_LENGTH",
      `expected ${APPLE_CHAIN_LENGTH} certificates in the x5c header, found ${x5c.length}`
    );
  }

  const roots = options.roots ?? appleRoots();

  // 1. The pin, first: a byte comparison, before any parsing or cryptography.
  //    A token signed by a perfectly valid non-Apple chain dies here.
  const offeredRoot = x5c[2];
  const root = roots.find((candidate) => bytesEqual(candidate.der, offeredRoot));
  if (!root) {
    throw new IapVerificationError(
      "INVALID_CERTIFICATE",
      "the certificate chain does not terminate at a pinned Apple root"
    );
  }
  if (!root.supported) {
    throw new IapVerificationError(
      "UNSUPPORTED_CERT_ALGORITHM",
      `the chain terminates at ${root.name}, whose key this SDK cannot verify against ` +
        "(v1 supports ECDSA roots only)"
    );
  }

  const leaf = parseOrReject(x5c[0], "leaf");
  const intermediate = parseOrReject(x5c[1], "intermediate");
  const rootCertificate = parseOrReject(root.der, "root");

  // 2. Apple's markers. Also cheap, and they say "this is a receipt-signing
  //    chain" rather than merely "this is an Apple chain" — an Apple-issued
  //    certificate for some other purpose must not sign purchase data.
  if (!intermediate.extensionOids.has(OID_APPLE_WWDR)) {
    throw new IapVerificationError(
      "INVALID_CERTIFICATE",
      `the intermediate certificate lacks the Apple Worldwide Developer Relations ` +
        `extension (${OID_APPLE_WWDR})`
    );
  }
  if (!leaf.extensionOids.has(OID_APPLE_RECEIPT_SIGNING)) {
    throw new IapVerificationError(
      "INVALID_CERTIFICATE",
      `the leaf certificate lacks the receipt-signing marker (${OID_APPLE_RECEIPT_SIGNING})`
    );
  }

  // 3. Validity windows, evaluated at the instant the caller chose.
  for (const [certificate, role] of [
    [leaf, "leaf"],
    [intermediate, "intermediate"],
    [rootCertificate, "root"],
  ] as const) {
    if (!isValidAt(certificate, options.at)) {
      throw new IapVerificationError(
        "INVALID_CERTIFICATE",
        `the ${role} certificate was not valid at ${new Date(options.at).toISOString()} ` +
          `(valid ${new Date(certificate.notBefore).toISOString()} to ` +
          `${new Date(certificate.notAfter).toISOString()})`
      );
    }
  }

  // 4. Finally the cryptography, walking up to the pinned root.
  await requireSignedBy(intermediate, rootCertificate, "intermediate", "root");
  await requireSignedBy(leaf, intermediate, "leaf", "intermediate");

  return { leaf, intermediate, root };
}
