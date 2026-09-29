/**
 * The shapes stored in the app's Base44 entities.
 *
 * Two rules run through all four:
 *
 * - **The raw signed token is the source of truth.** Every other column is a
 *   query convenience, derived from that token and safe to recompute. A logic
 *   fix therefore never needs a data migration.
 * - **Timestamps are epoch milliseconds**, matching what Apple sends, so a
 *   stored value can be compared against a fresh payload without parsing.
 *
 * Each row also carries a `signedDate` cursor. It is the instant *Apple*
 * signed the payload, never a local clock, which is what makes "newest wins"
 * agree across backend instances.
 */
import type {
  IapEnvironment,
  IapConsumptionRequestReason,
  IapOfferDiscountType,
  IapOfferType,
  IapOwnershipType,
  IapProductType,
  IapRevocationType,
  IapTransactionReason,
  IapAppleSubscriptionStatus,
} from "../verify/verify.types.js";

/** Fields Base44 adds to every record. */
export interface IapStoredRecordFields {
  /** The record's Base44 id. */
  id?: string;
  /** When Base44 created the record. */
  created_date?: string;
  /** When Base44 last changed the record. */
  updated_date?: string;
}

/** Where a stored payload came from. */
export type IapRecordSource =
  /** An App Store Server Notification. */
  | "notification"
  /** The app reporting a purchase, or a launch-time sync. */
  | "device"
  /** An App Store Server API call. */
  | "api";

/**
 * One purchase or renewal, keyed by `transactionId`.
 *
 * A renewal is a new row: Apple issues a fresh `transactionId` each period,
 * all sharing one `originalTransactionId`.
 */
export interface IapTransactionRecord extends IapStoredRecordFields {
  /** Apple's unique id for this transaction. The natural key. */
  transactionId: string;
  /** The first transaction in this chain. Stable across renewals. */
  originalTransactionId: string;
  /** The Base44 user this purchase belongs to, when it could be resolved. */
  appUserId: string | null;
  /** The UUID Apple signed into the transaction, which is how the user was resolved. */
  appAccountToken: string | null;
  /** The product purchased. */
  productId: string;
  /** What kind of product it is. */
  type: IapProductType | null;
  /** The subscription group, for auto-renewable subscriptions. */
  subscriptionGroupIdentifier: string | null;
  /** When the purchase was made. */
  purchaseDate: number | null;
  /** When the first purchase in this chain was made. */
  originalPurchaseDate: number | null;
  /** When the period ends, for auto-renewable subscriptions. */
  expiresDate: number | null;
  /**
   * When a non-renewing subscription ends, computed from the configured
   * duration.
   *
   * Apple does not expire these, so this column is the only thing that says
   * when access ends.
   */
  appDefinedExpiresDate: number | null;
  /** How many of a consumable were bought. */
  quantity: number | null;
  /** Whether the purchaser owns this, or received it through Family Sharing. */
  inAppOwnershipType: IapOwnershipType | null;
  /** Whether this is a first purchase or a renewal. */
  transactionReason: IapTransactionReason | null;
  /** Whether an upgrade replaced this transaction. */
  isUpgraded: boolean | null;
  /** Which kind of offer applied. */
  offerType: IapOfferType | null;
  /** The offer's identifier. */
  offerIdentifier: string | null;
  /** How the offer discounted the price. */
  offerDiscountType: IapOfferDiscountType | null;
  /** The offer's duration, as an ISO 8601 period. */
  offerPeriod: string | null;
  /** When Apple took the purchase back. Its presence alone means "not entitled". */
  revocationDate: number | null;
  /** Why it was taken back. */
  revocationReason: number | null;
  /** How it was taken back. */
  revocationType: IapRevocationType | null;
  /** How much was refunded, in thousandths of a percent. Absent once a refund is reversed. */
  revocationPercentage: number | null;
  /** Which environment produced the token. */
  environment: IapEnvironment;
  /** The App Store country, as a three-letter code. */
  storefront: string | null;
  /** Apple's numeric id for that storefront. */
  storefrontId: string | null;
  /** When Apple signed the payload. The newest-wins cursor. */
  signedDate: number;
  /** The token exactly as received. The source of truth. */
  rawJws: string;
  /** Where this row's newest payload came from. */
  source: IapRecordSource;
  /** When the app reported finishing the transaction, if it did. */
  finishedAt: number | null;
  /** When this SDK first stored the row. */
  recordedAt: number;
  /** When this SDK last changed the row. */
  updatedAt: number;
}

/**
 * One subscription, keyed by `originalTransactionId`.
 *
 * Holds the newest transaction and the newest renewal information, from which
 * status is derived at read time. It carries **two** cursors because those two
 * tokens arrive independently: a launch-time sync brings a fresh transaction
 * with no renewal information, while a notification brings both. One cursor
 * would let the sync advance past a later notification and silently lose a
 * grace-period date.
 */
export interface IapSubscriptionRecord extends IapStoredRecordFields {
  /** The subscription chain. The natural key. */
  originalTransactionId: string;
  /** The Base44 user this subscription belongs to. */
  appUserId: string | null;
  /** The subscription group. */
  subscriptionGroupIdentifier: string | null;
  /** The product of the newest transaction. */
  productId: string | null;
  /** The newest signed transaction. */
  latestTransactionJws: string | null;
  /** The newest signed renewal information. */
  latestRenewalInfoJws: string | null;
  /** `signedDate` of the newest transaction. Guards transaction updates. */
  latestSignedDate: number | null;
  /** `signedDate` of the newest renewal information. Guards renewal updates. */
  latestRenewalSignedDate: number | null;
  /** Apple's own status code, when a payload supplied one. Used only to cross-check. */
  appleStatus: IapAppleSubscriptionStatus | null;
  /** Which environment produced the tokens. */
  environment: IapEnvironment;
  /** When this SDK first stored the row. */
  recordedAt: number;
  /** When this SDK last changed the row. */
  updatedAt: number;
}

/**
 * How a notification was applied.
 *
 * `error` is load-bearing and does not mean "something broke": it is written
 * first, before the entity updates, and means **claimed but not yet applied**.
 * Duplicate detection only short-circuits on a row whose outcome is something
 * else. Without that, a notification whose writes failed after the row landed
 * would be treated as already handled on Apple's retry — and Apple only
 * retries a handful of times, so the purchase data would be lost for good.
 */
export type IapNotificationOutcome =
  /** Claimed, not yet applied. Retrying is safe and expected. */
  | "error"
  /** Applied. */
  | "applied"
  /** Already seen, so nothing was done. */
  | "duplicate"
  /** Older than what is stored, so nothing was applied. */
  | "stale"
  /** A known type this version stores but does not act on. */
  | "unhandled"
  /** A type Apple added after this version shipped. */
  | "unknown_type";

/** One notification from Apple, keyed by `notificationUUID`. */
export interface IapNotificationRecord extends IapStoredRecordFields {
  /** Apple's unique id. A resend keeps the same value, which is what enables de-duplication. */
  notificationUUID: string;
  /** What happened. */
  notificationType: string;
  /** A refinement of the type, when there is one. */
  subtype: string | null;
  /** When Apple signed the notification. */
  signedDate: number;
  /** When this SDK received it. */
  receivedAt: number;
  /** The subscription chain involved, when there is one. */
  originalTransactionId: string | null;
  /** The transaction involved, when there is one. */
  transactionId: string | null;
  /** Which environment produced it. */
  environment: IapEnvironment;
  /** The envelope exactly as received. */
  rawSignedPayload: string;
  /** How it was applied. See {@link IapNotificationOutcome}. */
  outcome: IapNotificationOutcome;
  /** How many times delivery has been attempted, counting Apple's retries. */
  attempts: number;
  /** Which version of this module wrote the row. */
  sdkVersion: string;
}

/** How Apple resolved a refund request. */
export type IapConsumptionOutcome = "REFUND" | "REFUND_DECLINED" | "REFUND_REVERSED";

/**
 * One refund request Apple wants consumption data for, keyed by `transactionId`.
 *
 * Apple gives 12 hours to answer in production and **5 minutes** in sandbox,
 * and only wants an answer if the customer consented to sharing the data.
 */
export interface IapConsumptionRequestRecord extends IapStoredRecordFields {
  /** The transaction being disputed. The natural key. */
  transactionId: string;
  /** The subscription chain, when there is one. */
  originalTransactionId: string | null;
  /** The Base44 user who bought it. */
  appUserId: string | null;
  /** Why the customer asked for a refund. */
  consumptionRequestReason: IapConsumptionRequestReason | null;
  /** When the request arrived. */
  receivedAt: number;
  /** When Apple stops accepting an answer. */
  deadlineAt: number;
  /** `signedDate` of the request. Guards request updates. */
  requestSignedDate: number;
  /** When an answer was sent, if one was. */
  respondedAt: number | null;
  /** The body that was sent. */
  response: unknown | null;
  /** How Apple resolved it, filled in by a later notification. */
  outcome: IapConsumptionOutcome | null;
  /** `signedDate` of the payload that set `outcome`. Guards outcome updates. */
  outcomeSignedDate: number | null;
  /** Which environment produced the request. */
  environment: IapEnvironment;
  /** When this SDK last changed the row. */
  updatedAt: number;
}
