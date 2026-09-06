/**
 * The same verification surface, backed by Apple's own library.
 *
 * An alternative to the built-in verifier, selected with `verifier: "apple"`.
 * It exists because Apple's library is authoritative and does two things the
 * built-in one does not — it checks the intermediate's CA basic constraint,
 * and it can do OCSP revocation lookups.
 *
 * Two structural differences drive the code below.
 *
 * **One environment per instance.** `SignedDataVerifier` is constructed for a
 * single `Environment` and rejects payloads from any other, so accepting both
 * production and sandbox means holding one instance per environment and trying
 * each in turn.
 *
 * **It reaches for Node built-ins.** `node:crypto`, `Buffer` and `node-fetch`.
 * Base44 backend functions run on Cloudflare Workers with `nodejs_compat`,
 * which does provide `X509Certificate` — but this path is unproven there,
 * which is exactly why the built-in verifier is kept and reachable by config.
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
import type { PayloadCheckConfig } from "./payload-checks.js";
import type { Verifier } from "./verifier.js";
import type {
  DecodedNotification,
  DecodedNotificationData,
  DecodedRenewalInfo,
  DecodedTransaction,
} from "./verify.types.js";

/** Apple's failure codes, mapped onto this SDK's. */
const STATUS_TO_CODE: Partial<Record<VerificationStatus, IapVerificationErrorCode>> =
  {
    [VerificationStatus.INVALID_APP_IDENTIFIER]: "INVALID_APP_IDENTIFIER",
    [VerificationStatus.INVALID_ENVIRONMENT]: "INVALID_ENVIRONMENT",
    [VerificationStatus.INVALID_CHAIN_LENGTH]: "INVALID_CHAIN_LENGTH",
    [VerificationStatus.INVALID_CERTIFICATE]: "INVALID_CERTIFICATE",
    [VerificationStatus.VERIFICATION_FAILURE]: "INVALID_SIGNATURE",
    [VerificationStatus.RETRYABLE_VERIFICATION_FAILURE]:
      "RETRYABLE_VERIFICATION_FAILURE",
    [VerificationStatus.FAILURE]: "INVALID_JWS_FORMAT",
  };

function toIapError(error: unknown): IapVerificationError {
  const status = (error as { status?: VerificationStatus } | undefined)?.status;
  const code =
    status !== undefined ? STATUS_TO_CODE[status] : undefined;
  return new IapVerificationError(
    code ?? "INVALID_SIGNATURE",
    error instanceof Error ? error.message : String(error),
    { cause: error }
  );
}

/** Inputs to {@link createAppleVerifier}. */
export interface CreateAppleVerifierOptions {
  readonly config: PayloadCheckConfig;
  /** Trust anchors, for this SDK's own tests. Defaults to Apple's pinned roots. @internal */
  readonly roots?: readonly { readonly der: Uint8Array }[];
  /** Whether to do OCSP revocation lookups. Off unless explicitly enabled. */
  readonly onlineChecks?: boolean;
}

export function createAppleVerifier(
  options: CreateAppleVerifierOptions
): Verifier {
  const { config } = options;

  // Apple's library takes Node Buffers. On Cloudflare Workers these come from
  // `nodejs_compat`; in tests, from Node itself.
  const rootBuffers = (options.roots ?? appleRoots()).map((root) =>
    Buffer.from(root.der)
  );

  /**
   * One verifier per accepted environment, most likely first.
   *
   * Production is always accepted. Sandbox needs `testMode`. Xcode is absent
   * on purpose: Apple's library skips signature checks entirely for it, and
   * routing to it would mean trusting an unverified `environment` claim to
   * decide whether to verify at all.
   */
  const verifiers = new Map<string, SignedDataVerifier>();
  const environments: Environment[] = [Environment.PRODUCTION];
  if (config.testMode) environments.push(Environment.SANDBOX);

  for (const environment of environments) {
    verifiers.set(
      environment,
      new SignedDataVerifier(
        rootBuffers,
        options.onlineChecks === true,
        environment,
        config.bundleId,
        // Apple's verifier requires this in production and rejects it in
        // sandbox, where its own payloads never carry one.
        environment === Environment.PRODUCTION ? config.appAppleId : undefined
      )
    );
  }

  /**
   * Reads the `environment` a token declares, without verifying anything.
   *
   * Only ever used to pick which verifier to hand the token to. It cannot be
   * used to bypass a check: the chosen verifier re-reads the same field and
   * rejects a mismatch, so a forged value just routes the token to an instance
   * that refuses it.
   *
   * Routing beats trying each instance in turn, because Apple's library checks
   * the app identifier *before* the environment — so a sandbox payload offered
   * to the production instance fails as `INVALID_APP_IDENTIFIER`, which is
   * indistinguishable from a token genuinely meant for another app.
   */
  function declaredEnvironment(token: string): string | undefined {
    try {
      const segment = token.split(".")[1];
      if (!segment) return undefined;
      const payload = JSON.parse(
        new TextDecoder().decode(base64UrlToBytes(segment))
      ) as Record<string, unknown>;

      const direct = payload.environment;
      if (typeof direct === "string") return direct;

      // A notification carries it inside whichever block it has.
      for (const key of ["data", "summary", "appData"] as const) {
        const block = payload[key] as { environment?: unknown } | undefined;
        if (block && typeof block.environment === "string") {
          return block.environment;
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
    const verifier =
      (declared !== undefined ? verifiers.get(declared) : undefined) ??
      verifiers.get(Environment.PRODUCTION);

    if (declared !== undefined && !verifiers.has(declared)) {
      throw new IapVerificationError(
        "INVALID_ENVIRONMENT",
        `this token is from the ${declared} environment, which this app does not ` +
          "accept (set testMode to accept Sandbox)"
      );
    }

    try {
      return await attempt(verifier as SignedDataVerifier);
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

      // The inner tokens are verified separately, and the raw strings are
      // replaced by their decoded form under names that say so — matching the
      // built-in verifier, so the ingestion layer cannot tell the two apart.
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
