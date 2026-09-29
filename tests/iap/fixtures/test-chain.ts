// A throwaway certificate chain, minted at test time, shaped like Apple's.
//
// Deliberately cross-curve — a P-384 root signing a P-256 intermediate — because
// that is Apple's real shape and it is the case that breaks implementations
// which infer the digest from the issuer's curve instead of reading each
// certificate's own signatureAlgorithm.
//
// `@peculiar/x509` is a devDependency used only here. It is an independent
// encoder, so it acts as an oracle for our hand-rolled reader rather than a
// mirror of it. It needs a Reflect polyfill, which is why `reflect-metadata` is
// imported first — both stay out of `src/` and out of the published package.
import "reflect-metadata";
import * as x509 from "@peculiar/x509";

x509.cryptoProvider.set(crypto);

/** Apple's Worldwide Developer Relations marker, required on the intermediate. */
export const OID_WWDR = "1.2.840.113635.100.6.2.1";
/** Apple's receipt-signing marker, required on the leaf. */
export const OID_RECEIPT_SIGNING = "1.2.840.113635.100.6.11.1";

const FAR_PAST = new Date(Date.UTC(2020, 0, 1));
const FAR_FUTURE = new Date(Date.UTC(2040, 0, 1));

/** A minted chain plus the leaf key needed to sign tokens with it. */
export interface TestChain {
  /** DER of the leaf, intermediate and root, in `x5c` order. */
  readonly x5c: readonly Uint8Array[];
  /** The root's DER, for pinning as a trust anchor. */
  readonly rootDer: Uint8Array;
  /** The leaf's private key, for signing a JWS. */
  readonly leafPrivateKey: CryptoKey;
}

/** How to bend a minted chain away from a valid one. */
export interface TestChainOptions {
  /** Leave the WWDR marker off the intermediate. */
  readonly omitWwdrOid?: boolean;
  /** Leave the receipt-signing marker off the leaf. */
  readonly omitReceiptOid?: boolean;
  /** Validity window for the leaf. Defaults to 2020 through 2040. */
  readonly leafNotBefore?: Date;
  readonly leafNotAfter?: Date;
  /**
   * Put the leaf certificate's key on P-384, so it disagrees with an ES256
   * header.
   *
   * The token is then signed with a separate P-256 key, so it still carries a
   * 64-byte ES256 signature and reaches the curve check instead of being
   * rejected earlier for its signature length.
   */
  readonly leafCurve?: "P-256" | "P-384";
}

function markerExtension(oid: string): x509.Extension {
  // Apple's markers are presence-only. A DER NULL is the smallest well-formed
  // extnValue, and nothing in verification reads the contents.
  return new x509.Extension(oid, false, new Uint8Array([0x05, 0x00]));
}

async function generate(curve: "P-256" | "P-384") {
  return crypto.subtle.generateKey({ name: "ECDSA", namedCurve: curve }, false, [
    "sign",
    "verify",
  ]);
}

function bytes(certificate: x509.X509Certificate): Uint8Array {
  return new Uint8Array(certificate.rawData);
}

/** Mints a fresh three-certificate chain. */
export async function createTestChain(
  options: TestChainOptions = {}
): Promise<TestChain> {
  const leafCurve = options.leafCurve ?? "P-256";

  const rootKeys = await generate("P-384");
  const intermediateKeys = await generate("P-256");
  const leafKeys = await generate(leafCurve);

  const root = await x509.X509CertificateGenerator.createSelfSigned({
    serialNumber: "01",
    name: "CN=Test Apple Root CA, O=Test",
    notBefore: FAR_PAST,
    notAfter: FAR_FUTURE,
    signingAlgorithm: { name: "ECDSA", hash: "SHA-384" },
    keys: rootKeys,
    extensions: [new x509.BasicConstraintsExtension(true, 2, true)],
  });

  const intermediate = await x509.X509CertificateGenerator.create({
    serialNumber: "02",
    subject: "CN=Test Apple WWDR CA, O=Test",
    issuer: root.subject,
    notBefore: FAR_PAST,
    notAfter: FAR_FUTURE,
    // Signed by the P-384 root, so this certificate's own signatureAlgorithm
    // is ecdsa-with-SHA384 even though its subject key is P-256.
    signingAlgorithm: { name: "ECDSA", hash: "SHA-384" },
    publicKey: intermediateKeys.publicKey,
    signingKey: rootKeys.privateKey,
    extensions: [
      new x509.BasicConstraintsExtension(true, 1, true),
      ...(options.omitWwdrOid ? [] : [markerExtension(OID_WWDR)]),
    ],
  });

  const leaf = await x509.X509CertificateGenerator.create({
    serialNumber: "03",
    subject: "CN=Test Receipt Signing, O=Test",
    issuer: intermediate.subject,
    notBefore: options.leafNotBefore ?? FAR_PAST,
    notAfter: options.leafNotAfter ?? FAR_FUTURE,
    signingAlgorithm: { name: "ECDSA", hash: "SHA-256" },
    publicKey: leafKeys.publicKey,
    signingKey: intermediateKeys.privateKey,
    extensions: [
      new x509.BasicConstraintsExtension(false, undefined, true),
      ...(options.omitReceiptOid ? [] : [markerExtension(OID_RECEIPT_SIGNING)]),
    ],
  });

  // Normally the token is signed by the leaf's own key. When the leaf is
  // deliberately on the wrong curve, sign with an unrelated P-256 key so the
  // signature is the right *length* and verification gets far enough to notice
  // the curve.
  const leafPrivateKey =
    leafCurve === "P-256"
      ? leafKeys.privateKey
      : (await generate("P-256")).privateKey;

  return {
    x5c: [bytes(leaf), bytes(intermediate), bytes(root)],
    rootDer: bytes(root),
    leafPrivateKey,
  };
}

/** Wraps a minted root as a trust anchor for `verifyChain`/`verifyJws`. */
export function trustAnchorsFor(chain: TestChain) {
  return [{ name: "Test Apple Root CA", der: chain.rootDer, supported: true }];
}

// One valid chain is reused across tests: minting three keypairs costs real
// milliseconds, and nothing in a passing test mutates it.
let shared: Promise<TestChain> | undefined;

/** The shared valid chain. */
export function validChain(): Promise<TestChain> {
  if (!shared) shared = createTestChain();
  return shared;
}
