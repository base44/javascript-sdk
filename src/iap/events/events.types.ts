/**
 * What happened, in the app's own vocabulary.
 *
 * Apple's notification types describe *its* billing system. These describe
 * what the app has to do about it, which is a much shorter list: something was
 * bought, something was taken away, a subscription changed shape.
 *
 * Every ingestion path produces these, and `onEvent` handlers receive them
 * after the write has landed — so a handler that sends an email or grants a
 * bonus can trust that the data behind it is already stored.
 */
import type { IapEnvironment } from "../verify/verify.types.js";
import type { IapRecordSource } from "../store/rows.types.js";

/** The kinds of event this module emits. */
export type IapEventType =
  /** A one-time purchase completed. */
  | "purchase.completed"
  /** Apple refunded a purchase. Take the content back. */
  | "purchase.refunded"
  /** Apple declined a refund request. Nothing to do. */
  | "purchase.refund_declined"
  /** A refund was reversed after a dispute. **Give the content back.** */
  | "purchase.refund_reversed"
  /** A family member's shared access ended. */
  | "purchase.revoked"
  /** Apple wants consumption data for a refund request, within a deadline. */
  | "refund.consumption_requested"
  /** A subscription started, either new or after a lapse. */
  | "subscription.started"
  /** A subscription renewed. */
  | "subscription.renewed"
  /** The customer changed plan, effective immediately. */
  | "subscription.plan_changed"
  /** The customer changed plan, effective at the next renewal. */
  | "subscription.plan_change_scheduled"
  /** The customer undid a scheduled plan change. */
  | "subscription.plan_change_cancelled"
  /** Automatic renewal was turned on or off. */
  | "subscription.auto_renew_changed"
  /** A payment failed. Check `inGracePeriod` before withdrawing access. */
  | "subscription.billing_issue"
  /** A billing grace period ended without a successful payment. */
  | "subscription.grace_period_ended"
  /** A subscription ended. */
  | "subscription.expired"
  /** The customer redeemed an offer. */
  | "subscription.offer_redeemed"
  /** A price increase was announced or accepted. */
  | "subscription.price_increase"
  /** Apple extended one subscriber's renewal date. */
  | "subscription.renewal_extended"
  /** A mass renewal-date extension finished. */
  | "subscription.mass_extension_result"
  /** A test notification arrived, confirming the webhook works. */
  | "apple.test_received"
  /** A notification type this version stores but does not act on. */
  | "apple.unhandled"
  /** A notification type Apple added after this version shipped. */
  | "apple.unknown"
  /** A launch-time sync completed. */
  | "sync.applied";

/** Why a subscription started. */
export type IapStartReason = "initial" | "resubscribe";

/** Why a subscription renewed. */
export type IapRenewReason = "renewal" | "billing_recovery";

/** Why a subscription ended. */
export type IapExpiryReason =
  | "voluntary"
  | "billing"
  | "price_increase"
  | "product_unavailable"
  | "other";

/**
 * One thing that happened.
 *
 * The identifying fields are all optional because not every event has them: a
 * mass-extension result concerns no single customer, and a purchase made
 * before the customer logged in has no `appUserId` until a later sync attaches
 * one.
 */
export interface IapEvent {
  /** What happened. */
  type: IapEventType;
  /** The Base44 user this concerns, when it could be resolved. */
  appUserId: string | null;
  /** The subscription chain involved. */
  originalTransactionId?: string;
  /** The transaction involved. */
  transactionId?: string;
  /** The product involved. */
  productId?: string;
  /** Which App Store environment this came from. */
  environment: IapEnvironment;
  /** When Apple says it happened, in epoch milliseconds. */
  occurredAt: number;
  /** Apple's notification id, when this came from a notification. */
  notificationUUID?: string;
  /** Where this event came from. */
  source: IapRecordSource;
  /** Apple's own notification type, when there was one. */
  notificationType?: string;
  /** Apple's own notification subtype, when there was one. */
  subtype?: string;

  /** Why a subscription started. Only on `subscription.started`. */
  startReason?: IapStartReason;
  /** Why a subscription renewed. Only on `subscription.renewed`. */
  renewReason?: IapRenewReason;
  /** Why a subscription ended. Only on `subscription.expired`. */
  expiryReason?: IapExpiryReason;
  /** Whether automatic renewal is now on. Only on `subscription.auto_renew_changed`. */
  autoRenewEnabled?: boolean;
  /**
   * Whether a billing grace period is running.
   *
   * Only on `subscription.billing_issue`. When true, Apple's requirement is to
   * **keep providing full service** — the customer has not lapsed yet.
   */
  inGracePeriod?: boolean;
  /** Where a price increase stands. Only on `subscription.price_increase`. */
  priceIncreaseConsent?: "pending" | "accepted";
  /** When Apple stops accepting consumption data. Only on `refund.consumption_requested`. */
  deadlineAt?: number;
  /** How many entitlements a sync disagreed with the server about. Only on `sync.applied`. */
  mismatches?: number;
  /** The decoded payload behind this event, for anything the fields above omit. */
  payload?: unknown;
}

/** A function called after an event's data has been stored. */
export type IapEventHandler = (event: IapEvent) => void | Promise<void>;
