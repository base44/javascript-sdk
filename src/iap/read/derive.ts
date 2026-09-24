/**
 * Working out where a subscription stands, from its stored tokens and a clock.
 *
 * Five rules, evaluated in order. The order is the whole thing: a refunded
 * subscription is not entitled even if its period has not ended, and a
 * subscription inside a billing grace period *is* entitled even though its
 * payment failed.
 *
 * Deriving rather than storing is what makes this survive missed
 * notifications. A subscription that lapsed reports as expired the moment its
 * expiry passes, whether or not Apple's `EXPIRED` notification ever arrived.
 * The one gap is a refund nobody told us about: that leaks until the period
 * ends, because nothing in the stored data implies it.
 *
 * @internal
 */
import type { ResolvedIapConfig } from "../config.js";
import type {
  DecodedRenewalInfo,
  DecodedTransaction,
  IapAppleSubscriptionStatus,
  IapEnvironment,
} from "../verify/verify.types.js";
import type {
  IapExpirationReason,
  IapSubscriptionStatus,
  SubscriptionState,
} from "./read.types.js";

/** Apple's `expirationIntent` values, in the app's vocabulary. */
const EXPIRATION_REASONS: Readonly<Record<number, IapExpirationReason>> = {
  1: "cancelled",
  2: "billing_error",
  3: "price_increase_declined",
  4: "product_unavailable",
  5: "other",
};

/** Where the derived status and Apple's own code agree. */
const APPLE_STATUS_FOR: Readonly<
  Record<IapSubscriptionStatus, IapAppleSubscriptionStatus>
> = {
  active: 1,
  expired: 2,
  billing_retry: 3,
  grace_period: 4,
  revoked: 5,
};

/** The two statuses that mean "give them the service". */
const ENTITLED_STATUSES: ReadonlySet<IapSubscriptionStatus> = new Set([
  "active",
  "grace_period",
]);

/** Just the status, for callers that need nothing else. */
export function deriveStatus(
  transaction: DecodedTransaction | undefined,
  renewal: DecodedRenewalInfo | undefined,
  now: number
): IapSubscriptionStatus {
  // 1. Taken back. Nothing below matters — Apple's rule is never to deliver
  //    content for a transaction carrying a revocation date.
  if (typeof transaction?.revocationDate === "number") return "revoked";

  const expiresDate = transaction?.expiresDate;

  // 2. Still inside the paid period.
  if (typeof expiresDate === "number" && expiresDate > now) return "active";

  // 3. Payment failed, but a grace period is running. Apple's requirement is
  //    explicit: "provide full service for the subscription throughout the
  //    grace period."
  const graceUntil = renewal?.gracePeriodExpiresDate;
  if (typeof graceUntil === "number" && graceUntil > now) return "grace_period";

  // 4. Payment failed with no grace period. Apple keeps retrying for up to 60
  //    days, and the customer is not entitled meanwhile.
  if (renewal?.isInBillingRetryPeriod === true) return "billing_retry";

  // 5. Anything else has ended. A subscription with no expiry date at all also
  //    lands here, which is the safe direction.
  return "expired";
}

/** Whether the derived status disagrees with the code Apple sent. */
export function statusDisagrees(
  status: IapSubscriptionStatus,
  appleStatus: IapAppleSubscriptionStatus | null | undefined
): boolean {
  if (appleStatus === null || appleStatus === undefined) return false;
  return APPLE_STATUS_FOR[status] !== appleStatus;
}

/** Everything the app can know about one subscription, right now. */
export function deriveSubscriptionState(input: {
  readonly originalTransactionId: string;
  readonly transaction: DecodedTransaction | undefined;
  readonly renewal: DecodedRenewalInfo | undefined;
  readonly environment: IapEnvironment;
  readonly appleStatus: IapAppleSubscriptionStatus | null;
  readonly now: number;
}): SubscriptionState {
  const { transaction, renewal, now } = input;
  const status = deriveStatus(transaction, renewal, now);

  const expirationIntent = renewal?.expirationIntent;
  const expirationReason =
    status === "expired" && typeof expirationIntent === "number"
      ? EXPIRATION_REASONS[expirationIntent] ?? "other"
      : null;

  const offerType = transaction?.offerType ?? renewal?.offerType;

  return {
    originalTransactionId: input.originalTransactionId,
    subscriptionGroupIdentifier: transaction?.subscriptionGroupIdentifier ?? null,
    productId: transaction?.productId ?? renewal?.productId ?? null,
    status,
    entitled: ENTITLED_STATUSES.has(status),
    expiresAt: transaction?.expiresDate ?? null,
    gracePeriodExpiresAt: renewal?.gracePeriodExpiresDate ?? null,
    willRenew: renewal?.autoRenewStatus === 1,
    autoRenewProductId: renewal?.autoRenewProductId ?? null,
    expirationReason,
    priceIncreaseConsentPending: renewal?.priceIncreaseStatus === 0,
    offer: offerType
      ? {
          type: offerType,
          identifier: transaction?.offerIdentifier ?? renewal?.offerIdentifier,
          discountType:
            transaction?.offerDiscountType ?? renewal?.offerDiscountType,
          period: transaction?.offerPeriod ?? renewal?.offerPeriod,
        }
      : null,
    eligibleWinBackOfferIds: Array.isArray(renewal?.eligibleWinBackOfferIds)
      ? [...(renewal?.eligibleWinBackOfferIds as string[])]
      : [],
    isFamilyShared: transaction?.inAppOwnershipType === "FAMILY_SHARED",
    revocation:
      typeof transaction?.revocationDate === "number"
        ? {
            date: transaction.revocationDate,
            reason: transaction.revocationReason ?? null,
            type: transaction.revocationType ?? null,
            percentage: transaction.revocationPercentage,
          }
        : null,
    environment: input.environment,
    appleStatus: input.appleStatus,
    signedDate: transaction?.signedDate ?? null,
  };
}

/**
 * Whether a row from this environment counts for this app.
 *
 * Production always counts. Sandbox only in test mode, and Xcode only with
 * local testing on — so a live app with both flags off honours real purchases
 * and nothing else.
 */
export function environmentCounts(
  environment: IapEnvironment,
  config: ResolvedIapConfig
): boolean {
  if (environment === "Sandbox") return config.testMode;
  if (environment === "Xcode") return config.allowLocalTesting;
  return true;
}
