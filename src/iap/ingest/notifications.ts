/**
 * The App Store Server Notifications webhook.
 *
 * The contract with Apple is unforgiving in one direction. Apple retries a
 * failure five times over 72 hours, but it **never** retries a success — so a
 * `200` returned before the data is stored loses that notification forever.
 * Everything below is arranged around that single fact:
 *
 * ```
 * parse            malformed              -> 400
 * verify           bad signature          -> 401
 * dedupe           already applied        -> 200
 * claim            write the raw payload, marked "not yet applied"
 * apply            entity writes
 * commit           mark the real outcome
 * respond                                 -> 200
 * emit             handlers, after the writes, before the response
 * anything failed                         -> 503, so Apple comes back
 * ```
 *
 * The claim step is what makes a retry safe. If the raw row lands and the
 * entity writes then fail, the row exists — and a naive duplicate check would
 * tell Apple's retry "already seen" and drop the purchase data. So the row
 * carries a commit flag, and a claimed-but-unapplied row is re-applied rather
 * than dismissed.
 *
 * Sandbox has no retries at all, so a failure there is a real loss. The
 * launch-time sync is what heals it.
 *
 * @internal
 */
import type { ResolvedIapConfig } from "../config.js";
import { IapVerificationError } from "../errors.js";
import type { Clock } from "../runtime/clock.js";
import type { IapEmitter } from "../events/emitter.js";
import type { IapEvent } from "../events/events.types.js";
import type { IapStore } from "../store/store.types.js";
import {
  CONSUMPTION_DESCRIPTOR,
  NOTIFICATION_DESCRIPTOR,
  SUBSCRIPTION_DESCRIPTOR,
  TRANSACTION_DESCRIPTOR,
} from "../store/descriptors.js";
import type {
  IapConsumptionOutcome,
  IapNotificationOutcome,
} from "../store/rows.types.js";
import type { Verifier } from "../verify/verifier.js";
import type { DecodedNotification } from "../verify/verify.types.js";
import { planFor, type NotificationPlan } from "./matrix.js";
import {
  consumptionRowFrom,
  notificationRowFrom,
  subscriptionRenewalPatch,
  subscriptionRowFrom,
  subscriptionTransactionPatch,
  transactionPatchFrom,
  transactionRowFrom,
} from "./mappers.js";

/** What `handleNotification` did, for tests, replay and the owner panel. */
export interface HandleNotificationResult {
  /** The HTTP status returned to Apple. */
  readonly status: number;
  /** What was recorded, when the payload was verified. */
  readonly outcome?: IapNotificationOutcome;
  /** Apple's notification id. */
  readonly notificationUUID?: string;
  /** Apple's notification type. */
  readonly notificationType?: string;
  /** The events emitted. */
  readonly events: readonly IapEvent[];
  /** Why the request was rejected, when it was. */
  readonly error?: string;
}

/** What the ingestion paths share. */
export interface IngestContext {
  readonly store: IapStore;
  readonly verifier: Verifier;
  readonly config: ResolvedIapConfig;
  readonly clock: Clock;
  readonly emitter: IapEmitter;
}

/** Refund outcomes a notification can resolve a consumption request with. */
const CONSUMPTION_OUTCOMES: Readonly<Record<string, IapConsumptionOutcome>> = {
  REFUND: "REFUND",
  REFUND_DECLINED: "REFUND_DECLINED",
  REFUND_REVERSED: "REFUND_REVERSED",
};

/**
 * Finds who a notification concerns.
 *
 * A webhook carries no user: the account token Apple signs in is a one-way
 * hash of a Base44 user id, so it cannot be turned back into one. The user is
 * therefore inherited from a row already stored for this subscription or
 * transaction, and stays null when there is none — which is the honest answer
 * for a purchase made before the customer ever logged in. A later sync from
 * that customer's device attaches it.
 */
async function resolveAppUserId(
  context: IngestContext,
  notification: DecodedNotification
): Promise<string | null> {
  const transaction = notification.data?.transactionInfo;
  if (!transaction) return null;

  const originalTransactionId = transaction.originalTransactionId
    ? String(transaction.originalTransactionId)
    : undefined;

  if (originalTransactionId) {
    const subscription = await context.store.getByKey(
      SUBSCRIPTION_DESCRIPTOR,
      originalTransactionId,
      ["appUserId"]
    );
    if (subscription?.appUserId) return subscription.appUserId;

    const original = await context.store.getByKey(
      TRANSACTION_DESCRIPTOR,
      originalTransactionId,
      ["appUserId"]
    );
    if (original?.appUserId) return original.appUserId;
  }

  return null;
}

/** Writes everything a notification implies. Throws if any write fails. */
async function applyPlan(
  context: IngestContext,
  notification: DecodedNotification,
  plan: NotificationPlan,
  appUserId: string | null
): Promise<void> {
  const now = context.clock();
  const data = notification.data;
  const transaction = data?.transactionInfo;

  if (plan.storeTransaction && transaction?.transactionId) {
    // The verifier hands back the original token under this name once it has
    // checked it, precisely so it can be stored.
    const rawJws = data?.transactionInfoJws ?? "";
    const row = transactionRowFrom(transaction, {
      source: "notification",
      appUserId,
      now,
      config: context.config,
      rawJws,
    });

    await context.store.upsertNewestWins(
      TRANSACTION_DESCRIPTOR,
      row.transactionId,
      { facet: "transaction", value: row.signedDate },
      row,
      transactionPatchFrom(row, { clearRevocation: plan.clearRevocation })
    );

    // The subscription row only moves when the payload really is a
    // subscription. The matrix says the type *can* concern one; the payload
    // says whether this instance does.
    const isSubscription =
      plan.touchesSubscription &&
      (transaction.type === "Auto-Renewable Subscription" ||
        Boolean(data?.renewalInfo));

    if (isSubscription) {
      const subscriptionRow = subscriptionRowFrom({
        transaction,
        transactionJws: rawJws,
        renewalInfo: data?.renewalInfo,
        renewalInfoJws: data?.renewalInfoJws,
        appUserId,
        appleStatus: data?.status,
        now,
      });

      await context.store.upsertNewestWins(
        SUBSCRIPTION_DESCRIPTOR,
        subscriptionRow.originalTransactionId,
        { facet: "transaction", value: subscriptionRow.latestSignedDate ?? now },
        subscriptionRow,
        subscriptionTransactionPatch(subscriptionRow)
      );

      // The renewal half carries its own cursor, so it can still land even
      // when the transaction cursor is already ahead of it.
      if (subscriptionRow.latestRenewalSignedDate !== null) {
        await context.store.patchWhere(
          SUBSCRIPTION_DESCRIPTOR,
          subscriptionRow.originalTransactionId,
          {
            cursorBelow: {
              facet: "renewal",
              value: subscriptionRow.latestRenewalSignedDate,
            },
          },
          subscriptionRenewalPatch(subscriptionRow)
        );
      }
    }
  }

  if (plan.consumption === "open") {
    const row = consumptionRowFrom({ notification, appUserId, now });
    if (row) {
      await context.store.upsertNewestWins(
        CONSUMPTION_DESCRIPTOR,
        row.transactionId,
        { facet: "request", value: row.requestSignedDate },
        row,
        {
          set: {
            consumptionRequestReason: row.consumptionRequestReason,
            deadlineAt: row.deadlineAt,
            requestSignedDate: row.requestSignedDate,
            appUserId: row.appUserId,
            updatedAt: now,
          },
        }
      );
    }
  }

  if (plan.consumption === "resolve" && transaction?.transactionId) {
    const outcome = CONSUMPTION_OUTCOMES[notification.notificationType];
    if (outcome) {
      const signedDate = Number(notification.signedDate ?? now);
      // Guarded by its own cursor, so a late refund cannot overwrite a newer
      // reversal.
      await context.store.patchWhere(
        CONSUMPTION_DESCRIPTOR,
        String(transaction.transactionId),
        { cursorBelow: { facet: "outcome", value: signedDate } },
        { set: { outcome, outcomeSignedDate: signedDate, updatedAt: now } }
      );
    }
  }
}

function eventFor(
  notification: DecodedNotification,
  plan: NotificationPlan,
  appUserId: string | null,
  now: number
): IapEvent {
  const transaction = notification.data?.transactionInfo;
  const consumption =
    plan.consumption === "open"
      ? consumptionRowFrom({ notification, appUserId, now })
      : null;

  return {
    type: plan.event,
    appUserId,
    originalTransactionId: transaction?.originalTransactionId
      ? String(transaction.originalTransactionId)
      : undefined,
    transactionId: transaction?.transactionId
      ? String(transaction.transactionId)
      : undefined,
    productId: transaction?.productId ? String(transaction.productId) : undefined,
    environment: (notification.data?.environment ??
      notification.summary?.environment ??
      "Production") as IapEvent["environment"],
    occurredAt: Number(notification.signedDate ?? now),
    notificationUUID: notification.notificationUUID,
    source: "notification",
    notificationType: notification.notificationType,
    subtype: notification.subtype,
    deadlineAt: consumption?.deadlineAt,
    payload: notification,
    ...plan.detail,
  };
}

/**
 * Handles one signed payload.
 *
 * Separate from the `Request` wrapper so a stored payload can be replayed, and
 * so tests do not have to build an HTTP request.
 */
export async function handleSignedPayload(
  context: IngestContext,
  signedPayload: string
): Promise<HandleNotificationResult> {
  let notification: DecodedNotification;
  try {
    notification = await context.verifier.verifyNotification(signedPayload);
  } catch (error) {
    // Retrying will not make an unverifiable payload verify, but answering
    // 200 would hide it. A 401 is honest, and the failure is visible.
    return {
      status: 401,
      events: [],
      error:
        error instanceof IapVerificationError
          ? `${error.code}: ${error.message}`
          : String(error),
    };
  }

  const now = context.clock();
  const plan = planFor(notification.notificationType, notification.subtype);

  // Duplicate detection, but only on a committed row. A row still marked
  // "not yet applied" means an earlier attempt claimed it and then failed, so
  // this delivery must finish the job rather than be waved through.
  const existing = await context.store.getByKey(
    NOTIFICATION_DESCRIPTOR,
    notification.notificationUUID,
    ["notificationUUID", "outcome"]
  );
  if (existing && existing.outcome !== "error") {
    return {
      status: 200,
      outcome: "duplicate",
      notificationUUID: notification.notificationUUID,
      notificationType: notification.notificationType,
      events: [],
    };
  }

  const appUserId = await resolveAppUserId(context, notification);

  try {
    if (!existing) {
      // Claim it: the raw payload lands first, so nothing is lost if the
      // writes below fail.
      await context.store.insertIfAbsent(
        NOTIFICATION_DESCRIPTOR,
        notification.notificationUUID,
        notificationRowFrom({ notification, rawSignedPayload: signedPayload, now })
      );
    }

    await applyPlan(context, notification, plan, appUserId);

    // Commit. Until this lands the row still reads as unapplied, so a retry
    // redoes the work — every write above is guarded and idempotent, so that
    // is safe.
    await context.store.patchWhere(
      NOTIFICATION_DESCRIPTOR,
      notification.notificationUUID,
      {},
      { set: { outcome: plan.outcome }, increment: { attempts: 1 } }
    );
  } catch (error) {
    // Every store failure is a 503, without exception. A pointless retry costs
    // nothing; a 200 that did not persist cannot be recovered. Apple's 72-hour
    // window can even outlast a fix and then heal on its own.
    return {
      status: 503,
      notificationUUID: notification.notificationUUID,
      notificationType: notification.notificationType,
      events: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const events = [eventFor(notification, plan, appUserId, now)];

  // Dispatched before the response, not after it. A Base44 backend function
  // cannot run work once it has answered, so anything deferred is lost. A
  // handler that throws is reported and ignored — it can never change the
  // status Apple sees.
  await context.emitter.emit(events);

  return {
    status: 200,
    outcome: plan.outcome,
    notificationUUID: notification.notificationUUID,
    notificationType: notification.notificationType,
    events,
  };
}

/** Handles an incoming HTTP request from Apple. */
export async function handleNotification(
  context: IngestContext,
  request: Request
): Promise<Response> {
  let signedPayload: unknown;
  try {
    const body = (await request.json()) as { signedPayload?: unknown };
    signedPayload = body?.signedPayload;
  } catch {
    return new Response(null, { status: 400 });
  }

  if (typeof signedPayload !== "string" || signedPayload.length === 0) {
    // A body Apple would never send. Retrying cannot fix it, but 400 is the
    // honest answer and keeps the failure visible.
    return new Response(null, { status: 400 });
  }

  const result = await handleSignedPayload(context, signedPayload);
  // Apple accepts 200 through 206 and needs no body.
  return new Response(null, { status: result.status });
}
