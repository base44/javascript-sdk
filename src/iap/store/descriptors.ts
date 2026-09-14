/**
 * Per-entity storage rules.
 *
 * The only place the store layer knows anything specific about the four
 * entities. Everything else is driven off these.
 *
 * @internal
 */
import type { IapEntityDescriptor } from "./store.types.js";
import type {
  IapConsumptionRequestRecord,
  IapNotificationRecord,
  IapSubscriptionRecord,
  IapTransactionRecord,
} from "./rows.types.js";

/**
 * A purchase or renewal.
 *
 * `expect: "insert"` because the key is almost always new — every renewal
 * carries a fresh `transactionId` — so trying the insert first saves a round
 * trip on the common path.
 */
export const TRANSACTION_DESCRIPTOR: IapEntityDescriptor<IapTransactionRecord> = {
  name: "IapTransaction",
  keyField: "transactionId",
  cursors: { transaction: "signedDate" },
  expect: "insert",
  mergeExcluded: [
    "transactionId",
    // Set once, when the SDK first saw the row.
    "recordedAt",
    // Owned by this SDK, not by Apple's payload, and guarded separately.
    "finishedAt",
  ],
  oldestWins: ["recordedAt"],
  heavyFields: ["rawJws"],
};

/**
 * A subscription.
 *
 * `expect: "update"` because after the first purchase the row exists and every
 * later payload updates it.
 *
 * Two cursors, because the transaction and the renewal information arrive
 * separately: a launch-time sync brings a transaction with no renewal
 * information, a notification brings both. With one shared cursor a sync could
 * advance past a later notification and silently drop a grace-period date,
 * which would deny service to a customer Apple is still trying to bill.
 */
export const SUBSCRIPTION_DESCRIPTOR: IapEntityDescriptor<IapSubscriptionRecord> = {
  name: "IapSubscription",
  keyField: "originalTransactionId",
  cursors: {
    transaction: "latestSignedDate",
    renewal: "latestRenewalSignedDate",
  },
  expect: "update",
  mergeExcluded: ["originalTransactionId", "recordedAt"],
  oldestWins: ["recordedAt"],
  heavyFields: ["latestTransactionJws", "latestRenewalInfoJws"],
};

/**
 * A notification from Apple.
 *
 * Immutable once committed, so it has no cursor: the only write after the
 * insert is the commit patch that sets the real outcome.
 */
export const NOTIFICATION_DESCRIPTOR: IapEntityDescriptor<IapNotificationRecord> = {
  name: "IapNotification",
  keyField: "notificationUUID",
  cursors: {},
  expect: "insert",
  mergeExcluded: [
    "notificationUUID",
    "notificationType",
    "signedDate",
    "receivedAt",
    "rawSignedPayload",
    "sdkVersion",
  ],
  oldestWins: ["receivedAt"],
  heavyFields: ["rawSignedPayload"],
};

/**
 * A refund-consumption request.
 *
 * Two cursors again: the request itself and the outcome a later notification
 * fills in, which can arrive out of order relative to a fresh request for the
 * same transaction.
 */
export const CONSUMPTION_DESCRIPTOR: IapEntityDescriptor<IapConsumptionRequestRecord> =
  {
    name: "IapConsumptionRequest",
    keyField: "transactionId",
    cursors: { request: "requestSignedDate", outcome: "outcomeSignedDate" },
    expect: "insert",
    mergeExcluded: [
      "transactionId",
      // Owned by this SDK: set when it answers Apple, and guarded separately
      // so two workers cannot both answer.
      "respondedAt",
      "response",
    ],
    oldestWins: ["receivedAt"],
    heavyFields: ["response"],
  };
