/**
 * Verification of Apple's signed tokens, over Apple's own library.
 *
 * `@apple/app-store-server-library` does the whole job: it walks the
 * certificate chain to a root **you** supply, checks the Apple marker
 * extensions on the intermediate and leaf, checks the intermediate's CA basic
 * constraint, evaluates validity at the payload's own `signedDate`, verifies
 * the signature, and then confirms the bundle id, app id and environment.
 *
 * Two structural facts about that library shape this file.
 *
 * **One environment per instance.** `SignedDataVerifier` is constructed for a
 * single `Environment` and rejects payloads from any other, so accepting more
 * than one means holding an instance per environment.
 *
 * **It checks the app identifier before the environment**, so a sandbox
 * payload offered to a production instance fails as `INVALID_APP_IDENTIFIER` —
 * indistinguishable from a token genuinely meant for another app. Tokens are
 * therefore routed by the environment they declare rather than tried in turn.
 *
 * It reaches for Node built-ins (`node:crypto`, `Buffer`, `node-fetch`). Base44
 * backend functions run on Cloudflare Workers with `nodejs_compat`, which
 * provides them; this path is verified working there.
 *
 * @internal
 */
import {
  Environment,
  SignedDataVerifier,
  VerificationStatus,
} from "@apple/app-store-server-library";
import { base64UrlToBytes } from "../runtime/base64.js";
import { IapVerificationError } from "../errors.js";
import type { IapVerificationErrorCode } from "../errors.types.js";
import { appleRoots } from "./apple-roots.js";
import { normalizeEnvironment, type PayloadCheckConfig } from "./payload-checks.js";
import type {
  DecodedNotification,
  DecodedNotificationData,
  DecodedRenewalInfo,
  DecodedTransaction,
} from "./verify.types.js";

/** The verification surface the rest of the module depends on. */
export interface Verifier {
  /** Verifies and decodes a signed transaction. */
  verifyTransaction(jws: string): Promise<DecodedTransaction>;
  /** Verifies and decodes signed renewal information. */
  verifyRenewalInfo(jws: string): Promise<DecodedRenewalInfo>;
  /** Verifies and decodes a notification, including its inner tokens. */
  verifyNotification(signedPayload: string): Promise<DecodedNotification>;
}

/** Apple's failure codes, mapped onto this SDK's. */
const STATUS_TO_CODE: Partial<Record<VerificationStatus, IapVerificationErrorCode>> = {
  [VerificationStatus.INVALID_APP_IDENTIFIER]: "INVALID_APP_IDENTIFIER",
  [VerificationStatus.INVALID_ENVIRONMENT]: "INVALID_ENVIRONMENT",
  [VerificationStatus.INVALID_CHAIN_LENGTH]: "INVALID_CHAIN_LENGTH",
  [VerificationStatus.INVALID_CERTIFICATE]: "INVALID_CERTIFICATE",
  [VerificationStatus.VERIFICATION_FAILURE]: "INVALID_SIGNATURE",
  [VerificationStatus.RETRYABLE_VERIFICATION_FAILURE]: "RETRYABLE_VERIFICATION_FAILURE",
  [VerificationStatus.FAILURE]: "INVALID_JWS_FORMAT",
};

function toIapError(error: unknown): IapVerificationError {
  if (error instanceof IapVerificationError) return error;
  const status = (error as { status?: VerificationStatus } | undefined)?.status;
  const code = status !== undefined ? STATUS_TO_CODE[status] : undefined;
  return new IapVerificationError(
    code ?? "INVALID_SIGNATURE",
    error instanceof Error ? error.message : String(error),
    { cause: error }
  );
}

/** Inputs to {@link createVerifier}. */
export interface CreateVerifierOptions {
  /** The app's identity and which environments it accepts. */
  readonly config: PayloadCheckConfig;
  /**
   * Trust anchors, for this SDK's own tests.
   *
   * Deliberately not reachable from `IapConfig`: an app must never be able to
   * add a root certificate.
   *
   * @internal
   */
  readonly roots?: readonly { readonly der: Uint8Array }[];
  /**
   * Whether to do OCSP certificate-revocation lookups.
   *
   * Off unless explicitly enabled. Turning it on also switches validity
   * evaluation from the payload's `signedDate` to the current time, which
   * means a stored token eventually stops verifying.
   */
  readonly onlineChecks?: boolean;
}

export function createVerifier(options: CreateVerifierOptions): Verifier {
  const { config } = options;

  // Apple's library takes Node Buffers. On Cloudflare Workers these come from
  // `nodejs_compat`; in tests, from Node itself.
  const rootBuffers = (options.roots ?? appleRoots()).map((root) =>
    Buffer.from(root.der)
  );

  /**
   * One verifier per accepted environment.
   *
   * Production is always accepted. Sandbox needs `testMode`, and Xcode needs
   * `allowLocalTesting` — so a live app with both flags off honours real
   * purchases and nothing else.
   */
  const verifiers = new Map<string, SignedDataVerifier>();
  const environments: Environment[] = [Environment.PRODUCTION];
  if (config.testMode) environments.push(Environment.SANDBOX);
  // Xcode signs its own tokens rather than Apple, so they cannot chain to an
  // Apple root. Apple's library skips chain validation for this environment,
  // which is the only way such a token can ever verify.
  if (config.allowLocalTesting) environments.push(Environment.XCODE);

  for (const environment of environments) {
    verifiers.set(
      environment,
      new SignedDataVerifier(
        rootBuffers,
        options.onlineChecks === true,
        environment,
        config.bundleId,
        // Required in production; absent from Apple's own sandbox payloads.
        environment === Environment.PRODUCTION ? config.appAppleId : undefined
      )
    );
  }

  /**
   * Reads the `environment` a token declares, without verifying anything.
   *
   * Only ever used to pick which verifier to hand the token to. It cannot be
   * used to bypass a check: the chosen verifier re-reads the same field and
   * rejects a mismatch, so a forged value routes the token to an instance that
   * refuses it.
   */
  function declaredEnvironment(token: string): string | undefined {
    try {
      const segment = token.split(".")[1];
      if (!segment) return undefined;
      const payload = JSON.parse(
        new TextDecoder().decode(base64UrlToBytes(segment))
      ) as Record<string, unknown>;

      if (typeof payload.environment === "string") {
        return normalizeEnvironment(payload.environment);
      }
      // A notification carries it inside whichever block it has.
      for (const key of ["data", "summary", "appData"] as const) {
        const block = payload[key] as { environment?: unknown } | undefined;
        if (block && typeof block.environment === "string") {
          return normalizeEnvironment(block.environment);
        }
      }
    } catch {
      // Malformed input: let the real verifier produce the error.
    }
    return undefined;
  }

  /** Hands the token to the verifier for the environment it declares. */
  async function withVerifier<T>(
    token: string,
    attempt: (verifier: SignedDataVerifier) => Promise<T>
  ): Promise<T> {
    const declared = declaredEnvironment(token);

    if (declared !== undefined && !verifiers.has(declared)) {
      throw new IapVerificationError(
        "INVALID_ENVIRONMENT",
        `this token is from the ${declared} environment, which this app does not ` +
          "accept (set testMode for Sandbox, or allowLocalTesting for Xcode)"
      );
    }

    const verifier =
      (declared !== undefined ? verifiers.get(declared) : undefined) ??
      (verifiers.get(Environment.PRODUCTION) as SignedDataVerifier);

    try {
      return await attempt(verifier);
    } catch (error) {
      throw toIapError(error);
    }
  }

  async function verifyTransaction(jws: string): Promise<DecodedTransaction> {
    return withVerifier(jws, async (verifier) =>
      (await verifier.verifyAndDecodeTransaction(jws)) as DecodedTransaction
    );
  }

  async function verifyRenewalInfo(jws: string): Promise<DecodedRenewalInfo> {
    return withVerifier(jws, async (verifier) =>
      (await verifier.verifyAndDecodeRenewalInfo(jws)) as DecodedRenewalInfo
    );
  }

  async function verifyNotification(
    signedPayload: string
  ): Promise<DecodedNotification> {
    const decoded = await withVerifier(signedPayload, async (verifier) =>
      verifier.verifyAndDecodeNotification(signedPayload)
    );

    const raw = decoded as unknown as Record<string, unknown>;
    const rawData = raw.data as
      | (Record<string, unknown> & {
          signedTransactionInfo?: unknown;
          signedRenewalInfo?: unknown;
        })
      | undefined;

    let data: DecodedNotificationData | undefined;
    if (rawData) {
      const { signedTransactionInfo, signedRenewalInfo, ...rest } = rawData;
      data = { ...rest } as DecodedNotificationData;

      // The inner tokens are separately signed, so each is verified in its own
      // right. The raw strings are then replaced by their decoded form under
      // names that say they have been checked, so no caller can act on an
      // unverified token by mistake — while storage still gets the original
      // bytes, which are the source of truth.
      if (typeof signedTransactionInfo === "string") {
        data.transactionInfo = await verifyTransaction(signedTransactionInfo);
        data.transactionInfoJws = signedTransactionInfo;
      }
      if (typeof signedRenewalInfo === "string") {
        data.renewalInfo = await verifyRenewalInfo(signedRenewalInfo);
        data.renewalInfoJws = signedRenewalInfo;
      }
    }

    const notificationUUID = raw.notificationUUID;
    const notificationType = raw.notificationType;
    if (typeof notificationUUID !== "string" || notificationUUID.length === 0) {
      throw new IapVerificationError(
        "INVALID_JWS_FORMAT",
        "the notification carries no 'notificationUUID', so it cannot be de-duplicated"
      );
    }
    if (typeof notificationType !== "string" || notificationType.length === 0) {
      throw new IapVerificationError(
        "INVALID_JWS_FORMAT",
        "the notification carries no 'notificationType'"
      );
    }

    return { ...raw, notificationUUID, notificationType, data } as DecodedNotification;
  }

  return { verifyTransaction, verifyRenewalInfo, verifyNotification };
}
