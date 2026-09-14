/**
 * What to do with each of Apple's notification types.
 *
 * A pure table, mapping Apple's `notificationType` and `subtype` onto three
 * things: which rows to touch, which event to emit, and what outcome to record.
 * No I/O, so every row is testable on its own — and adding a type Apple
 * invents later is a one-line change here rather than a new branch somewhere
 * in the webhook.
 *
 * Two rules from Apple that the table encodes rather than leaves to a caller:
 *
 * - An unrecognised type still gets a `200`. Apple retries a failure for up to
 *   72 hours, and retrying will not teach this version a type it does not
 *   know, so the payload is stored raw and the response is success.
 * - A reversed refund must **clear** the revocation, not merely record a new
 *   event, because the app has to give the content back.
 *
 * @internal
 */
import type { IapNotificationOutcome } from "../store/rows.types.js";
import type { IapEvent, IapEventType } from "../events/events.types.js";

/** What a notification does to stored state, and what it means to the app. */
export interface NotificationPlan {
  /** The event to emit. */
  readonly event: IapEventType;
  /** What to record in the notification's own row. */
  readonly outcome: Extract<
    IapNotificationOutcome,
    "applied" | "unhandled" | "unknown_type"
  >;
  /** Whether to store the transaction the payload carries. */
  readonly storeTransaction: boolean;
  /**
   * Whether this concerns an auto-renewable subscription.
   *
   * The payload still decides: the subscription row is only touched when the
   * transaction really is a subscription and carries the tokens for it.
   */
  readonly touchesSubscription: boolean;
  /** Whether to open a refund-consumption request, or to fill in its outcome. */
  readonly consumption?: "open" | "resolve";
  /** Whether to clear the revocation fields, so the app reinstates the content. */
  readonly clearRevocation?: boolean;
  /** Extra event detail this row implies. */
  readonly detail?: Partial<IapEvent>;
}

type SubtypeTable = Readonly<Record<string, NotificationPlan>>;

interface TypeEntry {
  /** Used when the notification has no subtype, or an unlisted one. */
  readonly base: NotificationPlan;
  /** Per-subtype refinements. */
  readonly subtypes?: SubtypeTable;
}

const subscriptionPlan = (
  event: IapEventType,
  detail?: Partial<IapEvent>
): NotificationPlan => ({
  event,
  outcome: "applied",
  storeTransaction: true,
  touchesSubscription: true,
  detail,
});

const purchasePlan = (
  event: IapEventType,
  extra: Partial<NotificationPlan> = {}
): NotificationPlan => ({
  event,
  outcome: "applied",
  storeTransaction: true,
  touchesSubscription: true,
  ...extra,
});

/** A type this version records but takes no action on. */
const unhandledPlan: NotificationPlan = {
  event: "apple.unhandled",
  outcome: "unhandled",
  storeTransaction: false,
  touchesSubscription: false,
};

/** A type Apple added after this version shipped. */
export const UNKNOWN_TYPE_PLAN: NotificationPlan = {
  event: "apple.unknown",
  outcome: "unknown_type",
  storeTransaction: false,
  touchesSubscription: false,
};

const TABLE: Readonly<Record<string, TypeEntry>> = {
  // ---- Subscription lifecycle ------------------------------------------
  SUBSCRIBED: {
    base: subscriptionPlan("subscription.started", { startReason: "initial" }),
    subtypes: {
      INITIAL_BUY: subscriptionPlan("subscription.started", {
        startReason: "initial",
      }),
      RESUBSCRIBE: subscriptionPlan("subscription.started", {
        startReason: "resubscribe",
      }),
    },
  },

  DID_RENEW: {
    base: subscriptionPlan("subscription.renewed", { renewReason: "renewal" }),
    subtypes: {
      BILLING_RECOVERY: subscriptionPlan("subscription.renewed", {
        renewReason: "billing_recovery",
      }),
    },
  },

  DID_CHANGE_RENEWAL_PREF: {
    // No subtype means a scheduled change was reverted.
    base: subscriptionPlan("subscription.plan_change_cancelled"),
    subtypes: {
      // Effective immediately, with a prorated refund of the old plan.
      UPGRADE: subscriptionPlan("subscription.plan_changed"),
      // Effective at the next renewal, so the current tier continues.
      DOWNGRADE: subscriptionPlan("subscription.plan_change_scheduled"),
    },
  },

  DID_CHANGE_RENEWAL_STATUS: {
    // No subtype means the customer cancelled after a price-increase notice.
    base: subscriptionPlan("subscription.auto_renew_changed", {
      autoRenewEnabled: false,
    }),
    subtypes: {
      AUTO_RENEW_ENABLED: subscriptionPlan("subscription.auto_renew_changed", {
        autoRenewEnabled: true,
      }),
      AUTO_RENEW_DISABLED: subscriptionPlan("subscription.auto_renew_changed", {
        autoRenewEnabled: false,
      }),
    },
  },

  DID_FAIL_TO_RENEW: {
    // No subtype means no grace period: Apple retries for up to 60 days and
    // the customer is not entitled meanwhile.
    base: subscriptionPlan("subscription.billing_issue", { inGracePeriod: false }),
    subtypes: {
      // Apple's requirement here is explicit: keep providing full service for
      // the whole grace period.
      GRACE_PERIOD: subscriptionPlan("subscription.billing_issue", {
        inGracePeriod: true,
      }),
    },
  },

  GRACE_PERIOD_EXPIRED: {
    base: subscriptionPlan("subscription.grace_period_ended"),
  },

  EXPIRED: {
    base: subscriptionPlan("subscription.expired", { expiryReason: "other" }),
    subtypes: {
      VOLUNTARY: subscriptionPlan("subscription.expired", {
        expiryReason: "voluntary",
      }),
      BILLING_RETRY: subscriptionPlan("subscription.expired", {
        expiryReason: "billing",
      }),
      PRICE_INCREASE: subscriptionPlan("subscription.expired", {
        expiryReason: "price_increase",
      }),
      PRODUCT_NOT_FOR_SALE: subscriptionPlan("subscription.expired", {
        expiryReason: "product_unavailable",
      }),
    },
  },

  OFFER_REDEEMED: {
    // The subtype refines which kind of change came with the offer; the offer
    // fields on the transaction say the rest.
    base: subscriptionPlan("subscription.offer_redeemed"),
  },

  PRICE_INCREASE: {
    base: subscriptionPlan("subscription.price_increase", {
      priceIncreaseConsent: "pending",
    }),
    subtypes: {
      PENDING: subscriptionPlan("subscription.price_increase", {
        priceIncreaseConsent: "pending",
      }),
      ACCEPTED: subscriptionPlan("subscription.price_increase", {
        priceIncreaseConsent: "accepted",
      }),
    },
  },

  RENEWAL_EXTENDED: {
    base: subscriptionPlan("subscription.renewal_extended"),
  },

  RENEWAL_EXTENSION: {
    // A mass extension result. Concerns a product, not one customer, so there
    // is no transaction to store.
    base: {
      event: "subscription.mass_extension_result",
      outcome: "applied",
      storeTransaction: false,
      touchesSubscription: false,
    },
  },

  // ---- One-time purchases and refunds ----------------------------------
  ONE_TIME_CHARGE: {
    base: purchasePlan("purchase.completed", { touchesSubscription: false }),
  },

  REFUND: {
    // The payload carries revocationDate, so storing the transaction is what
    // withdraws entitlement. Also resolves any open consumption request.
    base: purchasePlan("purchase.refunded", { consumption: "resolve" }),
  },

  REFUND_DECLINED: {
    base: purchasePlan("purchase.refund_declined", { consumption: "resolve" }),
  },

  REFUND_REVERSED: {
    // Apple's wording: "If your app revoked content or services because of the
    // refund, it needs to reinstate them." Clearing the revocation is what
    // makes the read layer say "entitled" again.
    base: purchasePlan("purchase.refund_reversed", {
      consumption: "resolve",
      clearRevocation: true,
    }),
  },

  REVOKE: {
    base: purchasePlan("purchase.revoked"),
  },

  CONSUMPTION_REQUEST: {
    // Apple's page lists this for consumables and subscriptions, its API page
    // for any type, so every type is handled.
    base: purchasePlan("refund.consumption_requested", { consumption: "open" }),
  },

  // ---- Housekeeping -----------------------------------------------------
  TEST: {
    base: {
      event: "apple.test_received",
      outcome: "applied",
      storeTransaction: false,
      touchesSubscription: false,
    },
  },

  // Programmes this SDK does not participate in. Stored raw, answered 200.
  EXTERNAL_PURCHASE_TOKEN: { base: unhandledPlan },
  METADATA_UPDATE: { base: unhandledPlan },
  PRICE_CHANGE: { base: unhandledPlan },
  RESCIND_CONSENT: { base: unhandledPlan },
  // Apple's enumeration page spells this MIGRATION and its changelog MIGRATE.
  // Both are accepted rather than guessing which is authoritative.
  MIGRATION: { base: unhandledPlan },
  MIGRATE: { base: unhandledPlan },
};

/**
 * Looks up what to do with a notification.
 *
 * Never throws and never returns nothing: a type this version has never seen
 * resolves to {@link UNKNOWN_TYPE_PLAN}, which stores the payload and answers
 * Apple successfully.
 */
export function planFor(
  notificationType: string,
  subtype?: string | null
): NotificationPlan {
  const entry = TABLE[notificationType];
  if (!entry) return UNKNOWN_TYPE_PLAN;
  if (subtype && entry.subtypes && entry.subtypes[subtype]) {
    return entry.subtypes[subtype];
  }
  return entry.base;
}

/** Every notification type this version recognises. For tests and diagnostics. */
export const KNOWN_NOTIFICATION_TYPES: readonly string[] = Object.keys(TABLE);
