/**
 * What the app reads back.
 *
 * Nothing here is stored. Status is worked out from the signed tokens against
 * the clock every time it is asked for, which is why a logic fix never needs a
 * data migration — and why a subscription that quietly lapsed reports as
 * expired even if the notification saying so never arrived.
 */
import type {
  IapAppleSubscriptionStatus,
  IapEnvironment,
  IapOfferDiscountType,
  IapOfferType,
} from "../verify/verify.types.js";

/**
 * Where a subscription stands.
 *
 * Two of the five mean the customer is entitled to service, and one of those
 * is easy to get wrong: a subscription in a billing **grace period** has
 * already failed a payment, but Apple's requirement is to keep providing full
 * service until the grace period ends. Billing **retry** without a grace
 * period is the opposite — not entitled.
 */
export type IapSubscriptionStatus =
  /** Paid and current. */
  | "active"
  /** Payment failed, but Apple is still trying and service must continue. */
  | "grace_period"
  /** Payment failed, no grace period. Not entitled. */
  | "billing_retry"
  /** Ended. */
  | "expired"
  /** Refunded or revoked. Never entitled, whatever else says. */
  | "revoked";

/** Why a subscription ended. */
export type IapExpirationReason =
  | "cancelled"
  | "billing_error"
  | "price_increase_declined"
  | "product_unavailable"
  | "other";

/** An offer applied to a subscription. */
export interface IapSubscriptionOffer {
  /** Which kind: `1` introductory, `2` promotional, `3` offer code, `4` win-back. */
  type: IapOfferType;
  /** The offer's identifier. */
  identifier?: string;
  /** How it discounts the price. */
  discountType?: IapOfferDiscountType;
  /** Its duration, as an ISO 8601 period. */
  period?: string;
}

/** How a purchase was taken back. */
export interface IapRevocation {
  /** When Apple took it back. */
  date: number;
  /** Why: `1` an issue in the app, `0` any other reason. */
  reason: number | null;
  /** How: a full refund, a prorated one, or family access ending. */
  type: string | null;
  /** How much was refunded, in thousandths of a percent. */
  percentage?: number;
}

/** One subscription, as it stands right now. */
export interface SubscriptionState {
  /** The subscription chain. */
  originalTransactionId: string;
  /** The subscription group. Products in one group are alternatives. */
  subscriptionGroupIdentifier: string | null;
  /** The product currently held. */
  productId: string | null;
  /** Where it stands. */
  status: IapSubscriptionStatus;
  /**
   * Whether the customer should get the service.
   *
   * True for `active` and `grace_period`. This is the only field a feature
   * gate needs.
   */
  entitled: boolean;
  /** When the current period ends. */
  expiresAt: number | null;
  /** When a billing grace period ends, if one is running. */
  gracePeriodExpiresAt: number | null;
  /** Whether it will renew. */
  willRenew: boolean;
  /**
   * What it will renew to.
   *
   * Different from `productId` when the customer has scheduled a plan change
   * for the next period.
   */
  autoRenewProductId: string | null;
  /** Why it ended, when it has. */
  expirationReason: IapExpirationReason | null;
  /** Whether the customer has been asked to accept a price increase and has not answered. */
  priceIncreaseConsentPending: boolean;
  /** The offer applied, if any. */
  offer: IapSubscriptionOffer | null;
  /** Win-back offers this customer is eligible for. */
  eligibleWinBackOfferIds: string[];
  /** Whether this came through Family Sharing rather than being bought directly. */
  isFamilyShared: boolean;
  /** Details of a refund or revocation, when there is one. */
  revocation: IapRevocation | null;
  /** Which App Store environment this came from. */
  environment: IapEnvironment;
  /**
   * Apple's own status code, when a payload supplied one.
   *
   * Kept only to cross-check the derived `status`. A disagreement means
   * something is stale and is worth investigating; the derived value is what
   * the SDK acts on.
   */
  appleStatus: IapAppleSubscriptionStatus | null;
  /** When Apple signed the data behind this. */
  signedDate: number | null;
}

/** A non-consumable the customer owns outright. */
export interface OwnedNonConsumable {
  productId: string;
  transactionId: string;
  originalTransactionId: string;
  purchaseDate: number | null;
  isFamilyShared: boolean;
}

/** A fixed-period subscription that does not renew itself. */
export interface OwnedNonRenewingSubscription {
  productId: string;
  transactionId: string;
  purchaseDate: number | null;
  /** When it ends, from the configured duration. Apple does not track this. */
  expiresAt: number | null;
  /** Whether it is still running. */
  active: boolean;
}

/**
 * Everything the customer currently owns.
 *
 * Consumables never appear. Apple's own current-entitlements list omits them
 * too: once used up, a consumable is the app's business to track, not the
 * store's.
 */
export interface Entitlements {
  /** Non-consumables owned outright and not refunded. */
  nonConsumables: OwnedNonConsumable[];
  /** Non-renewing subscriptions, with the app-defined expiry applied. */
  nonRenewingSubscriptions: OwnedNonRenewingSubscription[];
  /** Every subscription, entitled or not. */
  subscriptions: SubscriptionState[];
  /** The instant this was worked out. */
  asOf: number;
}

/** Narrows which subscriptions to look at. */
export interface SubscriptionQuery {
  /** Only subscriptions in this group. */
  subscriptionGroupId?: string;
  /** Only this product. */
  productId?: string;
}

/** Narrows an entitlement check. */
export interface EntitlementQuery {
  /** Any of these products counts. */
  productIds?: string[];
  /** Only subscriptions in this group count. */
  subscriptionGroupId?: string;
}

/** Narrows a transaction listing. */
export interface TransactionQuery {
  /** Apple's product type, e.g. `"Consumable"`. */
  type?: string;
  /** A single product. */
  productId?: string;
  /** `true` for refunded or revoked purchases only, `false` to exclude them. */
  revoked?: boolean;
  /** Purchased at or after this instant. */
  since?: number;
  /** Purchased before this instant. */
  until?: number;
  /** Only this environment. */
  environment?: IapEnvironment;
  /** Most rows to return. Defaults to 1000. */
  limit?: number;
}
