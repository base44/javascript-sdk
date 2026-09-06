/**
 * Turning a decoded Apple payload into the rows the store writes.
 *
 * Two things worth knowing before reading further.
 *
 * **The account-token mapping is one-way.** A Base44 user id hashes to a UUID,
 * and Apple signs that UUID into every transaction — but a hash cannot be
 * inverted, so a token does not yield the user back. That has a concrete
 * consequence per path:
 *
 * - `recordTransaction` and `syncEntitlements` run inside an authenticated
 *   request, so the user is already known. The token is used to *check* that
 *   claim, by re-deriving it and comparing.
 * - A webhook has no user. It inherits `appUserId` from a row already stored
 *   for the same subscription, and leaves it null when there is none — which
 *   is the honest answer for a purchase made before the customer logged in.
 *
 * **A merge omits what it does not know.** Every patch here drops nullish
 * values, so a bare device transaction cannot erase renewal information that a
 * notification supplied. Clearing a field is always explicit.
 *
 * @internal
 */
import { appAccountTokenFor } from "../account-token.js";
import { IapVerificationError } from "../errors.js";
import { IAP_MODULE_VERSION } from "../version.js";
import type { ResolvedIapConfig } from "../config.js";
import type {
  DecodedNotification,
  DecodedRenewalInfo,
  DecodedTransaction,
  IapEnvironment,
} from "../verify/verify.types.js";
import type {
  IapConsumptionRequestRecord,
  IapNotificationRecord,
  IapRecordSource,
  IapSubscriptionRecord,
  IapTransactionRecord,
} from "../store/rows.types.js";
import type { IapPatch } from "../store/store.types.js";

const DAY_MS = 86_400_000;

/** Apple's window for consumption data: 12 hours live, 5 minutes in sandbox. */
export function consumptionDeadline(
  receivedAt: number,
  environment: IapEnvironment
): number {
  return environment === "Production"
    ? receivedAt + 12 * 60 * 60 * 1000
    : receivedAt + 5 * 60 * 1000;
}

/**
 * Confirms a claimed user matches the UUID Apple signed into the transaction.
 *
 * @throws {IapVerificationError} when the token belongs to a different user.
 */
export function assertUserMatchesToken(
  decoded: DecodedTransaction,
  claimedUserId: string
): void {
  const token = decoded.appAccountToken;
  if (typeof token !== "string" || token.length === 0) return;

  const expected = appAccountTokenFor(claimedUserId);
  if (token.toLowerCase() !== expected.toLowerCase()) {
    throw new IapVerificationError(
      "INVALID_APP_IDENTIFIER",
      "this transaction's account token belongs to a different user than the one " +
        "making the request, so it will not be attributed to them"
    );
  }
}

/**
 * When a non-renewing subscription runs out.
 *
 * Apple never expires these — its own documentation says the app is
 * responsible — so the configured duration is the only thing that decides.
 */
function appDefinedExpiry(
  decoded: DecodedTransaction,
  config: ResolvedIapConfig
): number | null {
  const productId = decoded.productId;
  if (typeof productId !== "string") return null;
  const product = config.products[productId];
  if (!product || product.type !== "nonRenewingSubscription") return null;
  const days = product.nonRenewingDurationDays;
  const purchasedAt = decoded.purchaseDate;
  if (typeof days !== "number" || typeof purchasedAt !== "number") return null;
  return purchasedAt + days * DAY_MS;
}

function pick<T>(value: T | undefined): T | null {
  return value === undefined ? null : value;
}

/** Builds a complete transaction row, for an insert. */
export function transactionRowFrom(
  decoded: DecodedTransaction,
  context: {
    readonly source: IapRecordSource;
    readonly appUserId: string | null;
    readonly now: number;
    readonly config: ResolvedIapConfig;
    readonly rawJws: string;
  }
): IapTransactionRecord {
  const environment = (decoded.environment ?? "Production") as IapEnvironment;

  return {
    transactionId: String(decoded.transactionId),
    originalTransactionId: String(
      decoded.originalTransactionId ?? decoded.transactionId
    ),
    appUserId: context.appUserId,
    appAccountToken: pick(decoded.appAccountToken),
    productId: String(decoded.productId ?? ""),
    type: pick(decoded.type),
    subscriptionGroupIdentifier: pick(decoded.subscriptionGroupIdentifier),
    purchaseDate: pick(decoded.purchaseDate),
    originalPurchaseDate: pick(decoded.originalPurchaseDate),
    expiresDate: pick(decoded.expiresDate),
    appDefinedExpiresDate: appDefinedExpiry(decoded, context.config),
    quantity: pick(decoded.quantity),
    inAppOwnershipType: pick(decoded.inAppOwnershipType),
    transactionReason: pick(decoded.transactionReason),
    isUpgraded: pick(decoded.isUpgraded),
    offerType: pick(decoded.offerType),
    offerIdentifier: pick(decoded.offerIdentifier),
    offerDiscountType: pick(decoded.offerDiscountType),
    offerPeriod: pick(decoded.offerPeriod),
    revocationDate: pick(decoded.revocationDate),
    revocationReason: pick(decoded.revocationReason),
    revocationType: pick(decoded.revocationType),
    revocationPercentage: pick(decoded.revocationPercentage),
    environment,
    storefront: pick(decoded.storefront),
    storefrontId: pick(decoded.storefrontId),
    signedDate: Number(decoded.signedDate ?? context.now),
    rawJws: context.rawJws,
    source: context.source,
    finishedAt: null,
    recordedAt: context.now,
    updatedAt: context.now,
  };
}

/** Builds the merge for an existing transaction row. */
export function transactionPatchFrom(
  row: IapTransactionRecord,
  options: { readonly clearRevocation?: boolean } = {}
): IapPatch<IapTransactionRecord> {
  const { transactionId, recordedAt, finishedAt, ...rest } = row;
  void transactionId;
  void recordedAt;
  void finishedAt;

  if (options.clearRevocation) {
    // Apple omits revocationPercentage entirely when a refund is reversed, so
    // omitting nullish values is not enough — the stale revocation would
    // survive and keep a paying customer locked out. It has to be cleared.
    const {
      revocationDate,
      revocationReason,
      revocationType,
      revocationPercentage,
      ...withoutRevocation
    } = rest;
    void revocationDate;
    void revocationReason;
    void revocationType;
    void revocationPercentage;

    return {
      set: withoutRevocation as Partial<IapTransactionRecord>,
      clear: [
        "revocationDate",
        "revocationReason",
        "revocationType",
        "revocationPercentage",
      ],
    };
  }

  return { set: rest as Partial<IapTransactionRecord> };
}

/** Builds a complete subscription row, for an insert. */
export function subscriptionRowFrom(context: {
  readonly transaction: DecodedTransaction;
  readonly transactionJws: string;
  readonly renewalInfo?: DecodedRenewalInfo;
  readonly renewalInfoJws?: string;
  readonly appUserId: string | null;
  readonly appleStatus?: IapSubscriptionRecord["appleStatus"];
  readonly now: number;
}): IapSubscriptionRecord {
  const { transaction, renewalInfo } = context;
  return {
    originalTransactionId: String(
      transaction.originalTransactionId ?? transaction.transactionId
    ),
    appUserId: context.appUserId,
    subscriptionGroupIdentifier: pick(transaction.subscriptionGroupIdentifier),
    productId: pick(transaction.productId),
    latestTransactionJws: context.transactionJws,
    latestRenewalInfoJws: context.renewalInfoJws ?? null,
    latestSignedDate: Number(transaction.signedDate ?? context.now),
    latestRenewalSignedDate:
      renewalInfo && typeof renewalInfo.signedDate === "number"
        ? renewalInfo.signedDate
        : null,
    appleStatus: context.appleStatus ?? null,
    environment: (transaction.environment ?? "Production") as IapEnvironment,
    recordedAt: context.now,
    updatedAt: context.now,
  };
}

/**
 * The transaction half of a subscription merge.
 *
 * Deliberately excludes the renewal columns. They have their own cursor,
 * because a device sync brings a fresh transaction with no renewal
 * information — and if one cursor covered both, that sync would advance past a
 * later notification carrying a new grace-period date, denying service to a
 * customer Apple is still trying to bill.
 */
export function subscriptionTransactionPatch(
  row: IapSubscriptionRecord
): IapPatch<IapSubscriptionRecord> {
  return {
    set: {
      subscriptionGroupIdentifier: row.subscriptionGroupIdentifier,
      productId: row.productId,
      latestTransactionJws: row.latestTransactionJws,
      latestSignedDate: row.latestSignedDate,
      appleStatus: row.appleStatus,
      appUserId: row.appUserId,
      environment: row.environment,
      updatedAt: row.updatedAt,
    },
  };
}

/** The renewal half of a subscription merge, guarded by its own cursor. */
export function subscriptionRenewalPatch(
  row: IapSubscriptionRecord
): IapPatch<IapSubscriptionRecord> {
  return {
    set: {
      latestRenewalInfoJws: row.latestRenewalInfoJws,
      latestRenewalSignedDate: row.latestRenewalSignedDate,
      appleStatus: row.appleStatus,
      updatedAt: row.updatedAt,
    },
  };
}

/**
 * Builds a notification row, claimed but not yet applied.
 *
 * `outcome: "error"` is the commit flag. Duplicate detection only treats a row
 * as already handled once the outcome is something else, so a delivery whose
 * writes failed after this row landed is re-applied on Apple's retry rather
 * than dismissed as a duplicate — which would lose it for good, because Apple
 * stops retrying once it sees success.
 */
export function notificationRowFrom(context: {
  readonly notification: DecodedNotification;
  readonly rawSignedPayload: string;
  readonly now: number;
}): IapNotificationRecord {
  const { notification } = context;
  const transaction = notification.data?.transactionInfo;

  return {
    notificationUUID: notification.notificationUUID,
    notificationType: notification.notificationType,
    subtype: pick(notification.subtype),
    signedDate: Number(notification.signedDate ?? context.now),
    receivedAt: context.now,
    originalTransactionId: transaction?.originalTransactionId
      ? String(transaction.originalTransactionId)
      : null,
    transactionId: transaction?.transactionId
      ? String(transaction.transactionId)
      : null,
    environment: (notification.data?.environment ??
      notification.summary?.environment ??
      "Production") as IapEnvironment,
    rawSignedPayload: context.rawSignedPayload,
    outcome: "error",
    attempts: 1,
    sdkVersion: IAP_MODULE_VERSION,
  };
}

/** Builds a consumption-request row from a `CONSUMPTION_REQUEST` notification. */
export function consumptionRowFrom(context: {
  readonly notification: DecodedNotification;
  readonly appUserId: string | null;
  readonly now: number;
}): IapConsumptionRequestRecord | null {
  const transaction = context.notification.data?.transactionInfo;
  if (!transaction?.transactionId) return null;

  const environment = (context.notification.data?.environment ??
    "Production") as IapEnvironment;

  return {
    transactionId: String(transaction.transactionId),
    originalTransactionId: transaction.originalTransactionId
      ? String(transaction.originalTransactionId)
      : null,
    appUserId: context.appUserId,
    consumptionRequestReason: pick(
      context.notification.data?.consumptionRequestReason
    ),
    receivedAt: context.now,
    deadlineAt: consumptionDeadline(context.now, environment),
    requestSignedDate: Number(context.notification.signedDate ?? context.now),
    respondedAt: null,
    response: null,
    outcome: null,
    outcomeSignedDate: null,
    environment,
    updatedAt: context.now,
  };
}
