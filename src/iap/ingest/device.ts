/**
 * The two paths that start on the device.
 *
 * `recordTransaction` runs right after a purchase. Its contract with the shell
 * is the important part: the shell must **not** call StoreKit's `finish()`
 * until this resolves. An unfinished transaction is re-delivered at the next
 * launch, so the device is the retry queue — and a purchase finished before
 * the server stored it is a purchase nobody can prove.
 *
 * `syncEntitlements` runs at launch and on foreground. It is how everything
 * heals: a notification Apple never managed to deliver, a purchase made on
 * another device, a subscription that renewed while the app was closed.
 *
 * Both are idempotent.
 *
 * @internal
 */
import { IapVerificationError } from "../errors.js";
import type { IapEvent } from "../events/events.types.js";
import type { Reader } from "../read/read.js";
import {
  SUBSCRIPTION_DESCRIPTOR,
  TRANSACTION_DESCRIPTOR,
} from "../store/descriptors.js";
import type { DecodedTransaction } from "../verify/verify.types.js";
import type { IngestContext } from "./notifications.js";
import {
  assertUserMatchesToken,
  subscriptionRenewalPatch,
  subscriptionRowFrom,
  subscriptionTransactionPatch,
  transactionPatchFrom,
  transactionRowFrom,
} from "./mappers.js";
import type {
  RecordTransactionOptions,
  RecordTransactionResult,
  SyncPayload,
  SyncResult,
} from "./device.types.js";

const SUBSCRIPTION_TYPE = "Auto-Renewable Subscription";

/** Whether a decoded transaction is an auto-renewable subscription. */
function isSubscription(decoded: DecodedTransaction): boolean {
  return decoded.type === SUBSCRIPTION_TYPE;
}

/** Stores one verified transaction, and its subscription when it has one. */
async function storeTransaction(
  context: IngestContext,
  decoded: DecodedTransaction,
  jws: string,
  appUserId: string | null,
  renewal?: { readonly jws: string; readonly signedDate: number | null }
): Promise<{ transactionId: string; inserted: boolean }> {
  const now = context.clock();
  const row = transactionRowFrom(decoded, {
    source: "device",
    appUserId,
    now,
    config: context.config,
    rawJws: jws,
  });

  const result = await context.store.upsertNewestWins(
    TRANSACTION_DESCRIPTOR,
    row.transactionId,
    { facet: "transaction", value: row.signedDate },
    row,
    transactionPatchFrom(row)
  );

  if (isSubscription(decoded)) {
    const subscriptionRow = subscriptionRowFrom({
      transaction: decoded,
      transactionJws: jws,
      renewalInfoJws: renewal?.jws,
      appUserId,
      now,
    });
    // A bare device transaction carries no renewal information, so the row's
    // renewal cursor is left alone and whatever a notification put there
    // survives. That is why the two halves have separate cursors.
    if (renewal?.signedDate != null) {
      subscriptionRow.latestRenewalSignedDate = renewal.signedDate;
    }

    await context.store.upsertNewestWins(
      SUBSCRIPTION_DESCRIPTOR,
      subscriptionRow.originalTransactionId,
      { facet: "transaction", value: subscriptionRow.latestSignedDate ?? now },
      subscriptionRow,
      subscriptionTransactionPatch(subscriptionRow)
    );

    if (renewal && subscriptionRow.latestRenewalSignedDate !== null) {
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

  return { transactionId: row.transactionId, inserted: result.outcome === "inserted" };
}

/** Records a purchase the shell has just completed. */
export async function recordTransaction(
  context: IngestContext,
  jws: string,
  options: RecordTransactionOptions = {}
): Promise<RecordTransactionResult> {
  const decoded = await context.verifier.verifyTransaction(jws);

  const transactionId = decoded.transactionId;
  if (typeof transactionId !== "string" || transactionId.length === 0) {
    throw new IapVerificationError(
      "INVALID_JWS_FORMAT",
      "the transaction carries no transactionId, so it cannot be stored or de-duplicated"
    );
  }

  // The account token is a one-way hash of a user id, so it cannot be turned
  // into one — but it can confirm a claim. Rejecting a mismatch is what stops
  // one customer claiming another's purchase by replaying their token.
  let appUserId: string | null = null;
  if (options.appUserId) {
    assertUserMatchesToken(decoded, options.appUserId);
    appUserId = options.appUserId;
  }

  // Whether the row already existed is decided before the write, because that
  // is what tells the app not to deliver a consumable twice.
  const existing = await context.store.getByKey(
    TRANSACTION_DESCRIPTOR,
    transactionId,
    ["transactionId"]
  );
  const duplicate = existing !== null;

  // A throw here is deliberate and load-bearing: the shell must not call
  // finish(), so StoreKit keeps the transaction and re-delivers it next launch.
  await storeTransaction(context, decoded, jws, appUserId);

  if (!duplicate) {
    const event: IapEvent = {
      type: isSubscription(decoded) ? "subscription.started" : "purchase.completed",
      appUserId,
      originalTransactionId: decoded.originalTransactionId
        ? String(decoded.originalTransactionId)
        : undefined,
      transactionId,
      productId: decoded.productId ? String(decoded.productId) : undefined,
      environment: decoded.environment ?? "Production",
      occurredAt: Number(decoded.signedDate ?? context.clock()),
      source: "device",
      startReason: isSubscription(decoded) ? "initial" : undefined,
      payload: decoded,
    };
    await context.emitter.emit([event]);
  }

  return { recorded: true, transactionId, duplicate, decoded };
}

/** Reconciles what the device knows against what the server knows. */
export async function syncEntitlements(
  context: IngestContext,
  reader: Reader,
  payload: SyncPayload,
  options: RecordTransactionOptions = {}
): Promise<SyncResult> {
  const recordedTransactionIds: string[] = [];
  const deviceProductIds = new Set<string>();
  let skipped = 0;

  const appUserId = options.appUserId ?? null;

  /** Verifies and stores one token, counting rather than throwing on failure. */
  async function ingest(
    jws: string,
    renewal?: { readonly jws: string; readonly signedDate: number | null }
  ): Promise<void> {
    let decoded: DecodedTransaction;
    try {
      decoded = await context.verifier.verifyTransaction(jws);
      if (appUserId) assertUserMatchesToken(decoded, appUserId);
    } catch {
      // One unusable token must never fail the whole sync: the rest of the
      // device's purchases are still real and still need storing.
      skipped += 1;
      return;
    }

    if (typeof decoded.productId === "string") {
      deviceProductIds.add(decoded.productId);
    }

    try {
      const stored = await storeTransaction(
        context,
        decoded,
        jws,
        appUserId,
        renewal
      );
      // Reported only when it is durably stored, so the shell only finishes a
      // transaction the server can prove.
      recordedTransactionIds.push(stored.transactionId);
    } catch {
      skipped += 1;
    }
  }

  for (const jws of payload.entitlements ?? []) await ingest(jws);
  for (const jws of payload.unfinished ?? []) await ingest(jws);

  for (const pair of payload.statuses ?? []) {
    let renewalSignedDate: number | null = null;
    try {
      const renewal = await context.verifier.verifyRenewalInfo(pair.renewalInfoJws);
      renewalSignedDate =
        typeof renewal.signedDate === "number" ? renewal.signedDate : null;
    } catch {
      skipped += 1;
    }
    await ingest(pair.transactionJws, {
      jws: pair.renewalInfoJws,
      signedDate: renewalSignedDate,
    });
  }

  const snapshot = appUserId
    ? await reader.getEntitlements(appUserId)
    : { nonConsumables: [], nonRenewingSubscriptions: [], subscriptions: [], asOf: context.clock() };

  // What the device thinks it owns that the server does not agree is live.
  // Persistently above zero means notifications are going missing.
  const serverProductIds = new Set<string>();
  for (const item of snapshot.nonConsumables) serverProductIds.add(item.productId);
  for (const item of snapshot.nonRenewingSubscriptions) {
    if (item.active) serverProductIds.add(item.productId);
  }
  for (const state of snapshot.subscriptions) {
    if (state.entitled && state.productId) serverProductIds.add(state.productId);
  }

  let mismatches = 0;
  for (const productId of deviceProductIds) {
    if (!serverProductIds.has(productId)) mismatches += 1;
  }

  await context.emitter.emit([
    {
      type: "sync.applied",
      appUserId,
      environment: payload.environment ?? "Production",
      occurredAt: context.clock(),
      source: "device",
      mismatches,
    },
  ]);

  return { recordedTransactionIds, snapshot, mismatches, skipped };
}
