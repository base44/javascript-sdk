/**
 * The three verification entry points, assembled from the parts around them.
 *
 * Mirrors Apple's `SignedDataVerifier`: one method per kind of signed data,
 * each returning the decoded payload or throwing. There is no "verified but
 * with warnings" result — a token either passes every check or is rejected.
 *
 * @internal
 */
import { IapVerificationError } from "../errors.js";
import { systemClock, type Clock } from "../runtime/clock.js";
import type { AppleRoot } from "./apple-roots.js";
import { parseJws, verifyJws, type ParsedJws } from "./jws.js";
import {
  checkAppIdentifiers,
  checkEnvironment,
  normalizeEnvironment,
  type PayloadCheckConfig,
} from "./payload-checks.js";
import type {
  DecodedNotification,
  DecodedNotificationData,
  DecodedRenewalInfo,
  DecodedTransaction,
  IapEnvironment,
} from "./verify.types.js";

/** Inputs to {@link createVerifier}. */
export interface CreateVerifierOptions {
  /** The app's identity and which environments it accepts. */
  readonly config: PayloadCheckConfig;
  /**
   * Trust anchors, for this module's own tests only.
   *
   * Deliberately not reachable from `IapConfig`: an app must never be able to
   * add a root certificate.
   *
   * @internal
   */
  readonly roots?: readonly AppleRoot[];
  /** The clock, for tests. @internal */
  readonly clock?: Clock;
}

/** The verification surface. */
export interface Verifier {
  /** Verifies and decodes a signed transaction. */
  verifyTransaction(jws: string): Promise<DecodedTransaction>;
  /** Verifies and decodes signed renewal information. */
  verifyRenewalInfo(jws: string): Promise<DecodedRenewalInfo>;
  /** Verifies and decodes an App Store Server Notification, including its inner tokens. */
  verifyNotification(signedPayload: string): Promise<DecodedNotification>;
}

/**
 * Whether this token may skip certificate verification.
 *
 * Xcode's local StoreKit testing signs tokens with Xcode's own key rather than
 * Apple's, so they cannot chain to an Apple root — Apple's own library skips
 * chain validation for them too.
 *
 * Reading the environment out of an **unverified** payload to make this
 * decision is only safe because of what gates it: `allowLocalTesting` is off
 * unless a developer turned it on, and with it off this function always
 * returns false, so a forged `environment: "Xcode"` buys an attacker nothing.
 * Never widen this to a flag that could be on in production.
 */
function mayForgoChainVerification(
  environment: IapEnvironment | undefined,
  config: PayloadCheckConfig
): boolean {
  return environment === "Xcode" && config.allowLocalTesting;
}

function requireSignedDate(parsed: ParsedJws, what: string): number {
  const signedDate = parsed.payload.signedDate;
  if (typeof signedDate !== "number" || !Number.isFinite(signedDate)) {
    throw new IapVerificationError(
      "INVALID_JWS_FORMAT",
      `the ${what} carries no numeric 'signedDate', so its certificates cannot be ` +
        "evaluated at the moment Apple signed it"
    );
  }
  return signedDate;
}

export function createVerifier(options: CreateVerifierOptions): Verifier {
  const { config, roots } = options;
  const clock = options.clock ?? systemClock;

  /** Parse, then verify unless this is a local-testing token. */
  async function parseAndVerify(
    token: string,
    what: string,
    environmentOf: (payload: Record<string, unknown>) => unknown
  ): Promise<{ parsed: ParsedJws; environment: IapEnvironment }> {
    const parsed = parseJws(token);
    const environment = normalizeEnvironment(environmentOf(parsed.payload));

    if (!mayForgoChainVerification(environment, config)) {
      await verifyJws(parsed, { at: requireSignedDate(parsed, what), roots });
    }

    // Payload checks run in both cases: a local-testing token still has to be
    // for this app.
    return { parsed, environment: checkEnvironment(environment, config) };
  }

  async function verifyTransaction(jws: string): Promise<DecodedTransaction> {
    const { parsed, environment } = await parseAndVerify(
      jws,
      "transaction",
      (payload) => payload.environment
    );
    checkAppIdentifiers(parsed.payload, environment, config);
    return parsed.payload as DecodedTransaction;
  }

  async function verifyRenewalInfo(jws: string): Promise<DecodedRenewalInfo> {
    // Renewal information carries no bundleId or appAppleId — Apple does not
    // put them there — so there is nothing to check beyond the environment.
    const { parsed } = await parseAndVerify(
      jws,
      "renewal info",
      (payload) => payload.environment
    );
    return parsed.payload as DecodedRenewalInfo;
  }

  async function verifyNotification(
    signedPayload: string
  ): Promise<DecodedNotification> {
    const { parsed, environment } = await parseAndVerify(
      signedPayload,
      "notification",
      (payload) => {
        // The environment lives inside whichever block this notification type
        // carries.
        const data = payload.data as { environment?: unknown } | undefined;
        const summary = payload.summary as { environment?: unknown } | undefined;
        return data?.environment ?? summary?.environment;
      }
    );

    const payload = parsed.payload;

    const notificationUUID = payload.notificationUUID;
    const notificationType = payload.notificationType;
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

    const rawData = payload.data as
      | (Record<string, unknown> & {
          signedTransactionInfo?: unknown;
          signedRenewalInfo?: unknown;
        })
      | undefined;

    let data: DecodedNotificationData | undefined;
    if (rawData) {
      checkAppIdentifiers(rawData, environment, config);

      // The inner tokens are separately signed, so each is verified in its own
      // right rather than trusted because the envelope verified.
      const { signedTransactionInfo, signedRenewalInfo, ...rest } = rawData;
      data = { ...rest } as DecodedNotificationData;

      if (typeof signedTransactionInfo === "string") {
        data.transactionInfo = await verifyTransaction(signedTransactionInfo);
        // Kept alongside the decoded form, under a name that says it has been
        // verified. Storage needs the original bytes: they are the source of
        // truth every derived column can be rebuilt from.
        data.transactionInfoJws = signedTransactionInfo;
      }
      if (typeof signedRenewalInfo === "string") {
        data.renewalInfo = await verifyRenewalInfo(signedRenewalInfo);
        data.renewalInfoJws = signedRenewalInfo;
      }
    }

    return {
      ...payload,
      notificationUUID,
      notificationType,
      data,
      // A notification with no signedDate has already been rejected unless it
      // skipped verification, in which case the receive time is the best
      // ordering cursor available.
      signedDate:
        typeof payload.signedDate === "number" ? payload.signedDate : clock(),
    } as DecodedNotification;
  }

  return { verifyTransaction, verifyRenewalInfo, verifyNotification };
}
