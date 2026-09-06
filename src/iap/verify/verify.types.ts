/**
 * The decoded contents of Apple's signed tokens.
 *
 * Field names and meanings follow Apple's own documentation. Three rules apply
 * throughout:
 *
 * - **Every timestamp is epoch milliseconds**, as Apple sends them.
 * - **Every enumeration is open.** Apple adds values without warning, so each
 *   is typed as its known members plus `(string & {})`, which keeps editor
 *   completion while still accepting a value this SDK has never seen. Compare
 *   against the members you care about and treat anything else as unknown.
 * - **Unknown fields are preserved.** A payload carries the full decoded JSON,
 *   so a field Apple adds after this SDK shipped is still readable.
 */

/** A string union that still accepts values Apple may add later. */
type Open<T extends string> = T | (string & {});

/**
 * Which App Store environment a token came from.
 *
 * `Xcode` tokens are signed by Xcode rather than by Apple, so they never pass
 * certificate verification and are only usable with local testing turned on.
 */
export type IapEnvironment = "Sandbox" | "Production" | "Xcode";

/**
 * The kind of product a transaction is for.
 *
 * Apple sends these as display strings, spaces and all.
 */
export type IapProductType = Open<
  | "Auto-Renewable Subscription"
  | "Non-Consumable"
  | "Consumable"
  | "Non-Renewing Subscription"
>;

/** Who owns a transaction: the purchaser, or a family member sharing it. */
export type IapOwnershipType = Open<"PURCHASED" | "FAMILY_SHARED">;

/** Why a transaction exists. */
export type IapTransactionReason = Open<"PURCHASE" | "RENEWAL">;

/** What kind of offer applied. `1` introductory, `2` promotional, `3` offer code, `4` win-back. */
export type IapOfferType = 1 | 2 | 3 | 4;

/** How an offer discounts the price. */
export type IapOfferDiscountType = Open<
  "FREE_TRIAL" | "PAY_AS_YOU_GO" | "PAY_UP_FRONT" | "ONE_TIME"
>;

/** How a purchase was taken back. */
export type IapRevocationType = Open<
  "REFUND_FULL" | "REFUND_PRORATED" | "FAMILY_REVOKE"
>;

/**
 * The decoded contents of a signed transaction (`JWSTransaction`).
 *
 * Every field is optional because Apple omits what does not apply: a
 * consumable has no `expiresDate`, a sandbox payload has no `appAppleId`, and
 * `isUpgraded` appears only when it is true.
 */
export interface DecodedTransaction {
  /** Unique id for this transaction. A renewal gets a new one. */
  transactionId?: string;
  /** The id of the first transaction in this chain. Stable across renewals. */
  originalTransactionId?: string;
  /** The id of the transaction this one replaced, after a resubscribe. */
  previousOriginalTransactionId?: string;
  /** The app-level transaction id, present since Oct 2025. */
  appTransactionId?: string;
  /** The UUID the app attached at purchase time, used to map a purchase to a user. */
  appAccountToken?: string;
  /** The app's bundle identifier. */
  bundleId?: string;
  /** The product purchased. */
  productId?: string;
  /** Which subscription group the product belongs to. Auto-renewable subscriptions only. */
  subscriptionGroupIdentifier?: string;
  /** What kind of product this is. */
  type?: IapProductType;
  /** When this transaction was made. */
  purchaseDate?: number;
  /** When the first transaction in this chain was made. */
  originalPurchaseDate?: number;
  /** When the subscription period ends. Auto-renewable subscriptions only. */
  expiresDate?: number;
  /** How many of a consumable were bought. */
  quantity?: number;
  /** Whether the purchaser owns this or received it through Family Sharing. */
  inAppOwnershipType?: IapOwnershipType;
  /** Whether this is an initial purchase or an automatic renewal. */
  transactionReason?: IapTransactionReason;
  /** Present, and true, only when this transaction was replaced by an upgrade. */
  isUpgraded?: boolean;
  /** Which kind of offer applied, if any. */
  offerType?: IapOfferType;
  /** The offer's identifier, for promotional offers and offer codes. */
  offerIdentifier?: string;
  /** How the offer discounted the price. */
  offerDiscountType?: IapOfferDiscountType;
  /** The offer's duration, as an ISO 8601 period. */
  offerPeriod?: string;
  /** When Apple took the purchase back. Its presence means "not entitled", whatever else says. */
  revocationDate?: number;
  /** Why it was taken back. `1` means an issue in the app, `0` any other reason. */
  revocationReason?: number;
  /** How it was taken back. */
  revocationType?: IapRevocationType;
  /** How much was refunded, in thousandths of a percent (0 to 100000). Absent once a refund is reversed. */
  revocationPercentage?: number;
  /** Which environment produced the token. */
  environment?: IapEnvironment;
  /** The App Store country the purchase was made in, as a three-letter code. */
  storefront?: string;
  /** Apple's numeric id for that storefront. */
  storefrontId?: string;
  /**
   * The price, in thousandths of a currency unit — `1990` means 1.99.
   *
   * Apple's guidance is not to use this for revenue reporting; use App Store
   * Connect's financial reports instead.
   */
  price?: number;
  /** The currency of `price`, as an ISO 4217 code. Not for revenue reporting. */
  currency?: string;
  /** How the subscription is billed. */
  billingPlanType?: string;
  /** Commitment details for plans that have them. Passed through undecoded. */
  commitmentInfo?: unknown;
  /** Apple's per-line-item id for web orders. */
  webOrderLineItemId?: string;
  /** Advanced Commerce details, if the app uses that API. Passed through undecoded. */
  advancedCommerceInfo?: unknown;
  /** When Apple signed this token. The cursor that decides which copy of a row is newest. */
  signedDate?: number;
  /** Any field Apple added after this SDK shipped. */
  [key: string]: unknown;
}

/**
 * Why a subscription ended, from `expirationIntent`.
 *
 * `1` the customer cancelled, `2` billing failed, `3` the customer declined a
 * price increase, `4` the product became unavailable, `5` any other reason.
 */
export type IapExpirationIntent = 1 | 2 | 3 | 4 | 5;

/**
 * The decoded contents of signed renewal information (`JWSRenewalInfo`).
 *
 * This is where a subscription's *future* lives — whether it will renew, what
 * it will renew to, and whether it is inside a billing grace period. A bare
 * transaction does not carry any of it, which is why the launch-time sync
 * sends transaction and renewal tokens as a pair.
 */
export interface DecodedRenewalInfo {
  /** The subscription chain this describes. */
  originalTransactionId?: string;
  /** The app-level transaction id. */
  appTransactionId?: string;
  /** The UUID the app attached at purchase time. */
  appAccountToken?: string;
  /** The currently active product. */
  productId?: string;
  /** What the subscription will renew to. Differs from `productId` when a plan change is scheduled. */
  autoRenewProductId?: string;
  /** Whether the subscription will renew. `1` yes, `0` no. */
  autoRenewStatus?: 0 | 1;
  /** When the next renewal is due. */
  renewalDate?: number;
  /** Why the subscription ended, when it has. */
  expirationIntent?: IapExpirationIntent;
  /** When a billing grace period ends. Service must continue until then. */
  gracePeriodExpiresDate?: number;
  /** Whether Apple is still retrying a failed payment. */
  isInBillingRetryPeriod?: boolean;
  /** Whether the customer has answered a price increase. `0` pending, `1` consented or not required. */
  priceIncreaseStatus?: 0 | 1;
  /** Win-back offers this customer is eligible for. */
  eligibleWinBackOfferIds?: string[];
  /** Which kind of offer applies to the next period. */
  offerType?: IapOfferType;
  /** That offer's identifier. */
  offerIdentifier?: string;
  /** How that offer discounts the price. */
  offerDiscountType?: IapOfferDiscountType;
  /** That offer's duration, as an ISO 8601 period. */
  offerPeriod?: string;
  /** The renewal price, in thousandths of a currency unit. Not for revenue reporting. */
  renewalPrice?: number;
  /** The currency of `renewalPrice`, as an ISO 4217 code. */
  currency?: string;
  /** How the renewal is billed. */
  renewalBillingPlanType?: string;
  /** Commitment details, passed through undecoded. */
  commitmentInfo?: unknown;
  /**
   * When the current run of subscription started.
   *
   * Apple's guidance is not to use this to compute how long someone has paid.
   */
  recentSubscriptionStartDate?: number;
  /** Which environment produced the token. */
  environment?: IapEnvironment;
  /** Advanced Commerce details, passed through undecoded. */
  advancedCommerceInfo?: unknown;
  /** When Apple signed this token. */
  signedDate?: number;
  /** Any field Apple added after this SDK shipped. */
  [key: string]: unknown;
}

/**
 * Apple's own view of a subscription's state.
 *
 * `1` active, `2` expired, `3` in billing retry, `4` in a billing grace
 * period, `5` revoked. This SDK derives its own status from the stored tokens
 * and uses this only to cross-check.
 */
export type IapAppleSubscriptionStatus = 1 | 2 | 3 | 4 | 5;

/** Why a customer asked for a refund. */
export type IapConsumptionRequestReason = Open<
  | "UNINTENDED_PURCHASE"
  | "FULFILLMENT_ISSUE"
  | "UNSATISFIED_WITH_PURCHASE"
  | "LEGAL"
  | "OTHER"
>;

/** The `data` block of a notification: one transaction and, for subscriptions, its renewal info. */
export interface DecodedNotificationData {
  /** The app's numeric App Store id. Absent from sandbox payloads. */
  appAppleId?: number;
  /** The app's bundle identifier. */
  bundleId?: string;
  /** The app version the purchase was made in. */
  bundleVersion?: string;
  /** Which environment produced the notification. */
  environment?: IapEnvironment;
  /** The decoded transaction. */
  transactionInfo?: DecodedTransaction;
  /** The decoded renewal information. Auto-renewable subscriptions only. */
  renewalInfo?: DecodedRenewalInfo;
  /**
   * The signed transaction token, exactly as Apple sent it.
   *
   * Present only after verification succeeded, so it is safe to store — and it
   * has to be stored, because the signed token is the source of truth that
   * every derived value can be recomputed from. The raw `signedTransactionInfo`
   * field is replaced by this pair so no caller can act on a token that has
   * not been checked.
   */
  transactionInfoJws?: string;
  /** The signed renewal-information token, exactly as Apple sent it. */
  renewalInfoJws?: string;
  /** Apple's own status code. Auto-renewable subscriptions only. */
  status?: IapAppleSubscriptionStatus;
  /** Why a refund was requested. `CONSUMPTION_REQUEST` only. */
  consumptionRequestReason?: IapConsumptionRequestReason;
  /** Any field Apple added after this SDK shipped. */
  [key: string]: unknown;
}

/** The `summary` block, sent when a mass renewal-date extension finishes. */
export interface DecodedNotificationSummary {
  /** The identifier the extension request was made with. */
  requestIdentifier?: string;
  /** Which environment the request ran in. */
  environment?: IapEnvironment;
  /** The app's numeric App Store id. */
  appAppleId?: number;
  /** The app's bundle identifier. */
  bundleId?: string;
  /** The product whose subscribers were extended. */
  productId?: string;
  /** The storefronts the request covered. */
  storefrontCountryCodes?: string[];
  /** How many subscriptions could not be extended. */
  failedCount?: number;
  /** How many were extended. */
  succeededCount?: number;
  /** Any field Apple added after this SDK shipped. */
  [key: string]: unknown;
}

/**
 * The decoded contents of an App Store Server Notification (version 2).
 *
 * Exactly one of `data`, `summary`, `externalPurchaseToken` or `appData` is
 * present, decided by `notificationType`.
 */
export interface DecodedNotification {
  /** What happened. See Apple's `notificationType` list. */
  notificationType: string;
  /** A refinement of `notificationType`, when there is one. */
  subtype?: string;
  /**
   * Apple's unique id for this notification.
   *
   * A resent notification keeps the same value, which is what makes
   * duplicate detection possible.
   */
  notificationUUID: string;
  /** When Apple signed the notification. */
  signedDate?: number;
  /** The payload version. `"2.0"` for everything this SDK handles. */
  version?: string;
  /** The transaction and renewal information, for most notification types. */
  data?: DecodedNotificationData;
  /** The result of a mass renewal-date extension. */
  summary?: DecodedNotificationSummary;
  /** An external-purchase token, for apps using that programme. */
  externalPurchaseToken?: unknown;
  /** A signed app transaction, sent when a child account's consent is withdrawn. */
  appData?: unknown;
  /** Any field Apple added after this SDK shipped. */
  [key: string]: unknown;
}
