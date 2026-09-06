/**
 * The four entities the in-app purchase module stores data in.
 *
 * An npm package cannot create a Base44 entity, so these ship as **data**: the
 * app creates the entities once from these definitions, and the SDK checks on
 * first write that what it wrote came back intact.
 *
 * Field types are deliberately loose where Apple's are open. A notification
 * type is a string, not an enumeration, because Apple adds values without
 * warning and an entity that rejected an unknown one would turn a new Apple
 * feature into dropped purchase data.
 */

/** The entities this module needs. */
export type IapEntityName =
  | "IapTransaction"
  | "IapSubscription"
  | "IapNotification"
  | "IapConsumptionRequest";

/** A field in an entity schema. */
export interface IapSchemaField {
  /** The field's JSON type. */
  type: "string" | "number" | "boolean" | "object";
  /** What the field holds, shown in the Base44 editor. */
  description: string;
}

/** One entity definition, ready to create in Base44. */
export interface IapEntitySchema {
  /** The entity name. Must match exactly — the SDK looks it up by this name. */
  name: IapEntityName;
  /** What the entity is for. */
  description: string;
  /**
   * The field holding the natural key.
   *
   * Base44 cannot enforce uniqueness on it today, so the SDK guards writes
   * itself and tolerates duplicates on read.
   */
  naturalKey: string;
  /** The JSON Schema for the entity's fields. */
  schema: {
    type: "object";
    properties: Record<string, IapSchemaField>;
    required: string[];
  };
}

const str = (description: string): IapSchemaField => ({ type: "string", description });
const num = (description: string): IapSchemaField => ({ type: "number", description });
const bool = (description: string): IapSchemaField => ({ type: "boolean", description });
const obj = (description: string): IapSchemaField => ({ type: "object", description });

const TRANSACTION: IapEntitySchema = {
  name: "IapTransaction",
  description:
    "One Apple purchase or renewal. A renewal is a new row: Apple issues a fresh " +
    "transactionId each period, all sharing one originalTransactionId.",
  naturalKey: "transactionId",
  schema: {
    type: "object",
    properties: {
      transactionId: str("Apple's unique id for this transaction. The natural key."),
      originalTransactionId: str("The first transaction in this chain."),
      appUserId: str("The Base44 user this purchase belongs to."),
      appAccountToken: str("The UUID Apple signed into the transaction."),
      productId: str("The product purchased."),
      type: str("Apple's product type, e.g. 'Auto-Renewable Subscription'."),
      subscriptionGroupIdentifier: str("The subscription group, for subscriptions."),
      purchaseDate: num("When the purchase was made, in epoch milliseconds."),
      originalPurchaseDate: num("When the first purchase in this chain was made."),
      expiresDate: num("When the subscription period ends."),
      appDefinedExpiresDate: num(
        "When a non-renewing subscription ends, computed from the configured duration. " +
          "Apple does not expire these."
      ),
      quantity: num("How many of a consumable were bought."),
      inAppOwnershipType: str("PURCHASED, or FAMILY_SHARED for a shared purchase."),
      transactionReason: str("PURCHASE or RENEWAL."),
      isUpgraded: bool("Whether an upgrade replaced this transaction."),
      offerType: num("1 introductory, 2 promotional, 3 offer code, 4 win-back."),
      offerIdentifier: str("The offer's identifier."),
      offerDiscountType: str("FREE_TRIAL, PAY_AS_YOU_GO, PAY_UP_FRONT or ONE_TIME."),
      offerPeriod: str("The offer's duration, as an ISO 8601 period."),
      revocationDate: num(
        "When Apple took the purchase back. Its presence alone means the customer " +
          "is no longer entitled."
      ),
      revocationReason: num("1 an issue in the app, 0 any other reason."),
      revocationType: str("REFUND_FULL, REFUND_PRORATED or FAMILY_REVOKE."),
      revocationPercentage: num(
        "How much was refunded, in thousandths of a percent. Absent once a refund is reversed."
      ),
      environment: str("Sandbox, Production or Xcode."),
      storefront: str("The App Store country, as a three-letter code."),
      storefrontId: str("Apple's numeric id for that storefront."),
      signedDate: num(
        "When Apple signed the payload. The cursor that decides which copy of a row is newest."
      ),
      rawJws: str("The signed token exactly as received. The source of truth."),
      source: str("notification, device or api."),
      finishedAt: num("When the app reported finishing the transaction."),
      recordedAt: num("When the SDK first stored the row."),
      updatedAt: num("When the SDK last changed the row."),
    },
    required: [
      "transactionId",
      "originalTransactionId",
      "productId",
      "environment",
      "signedDate",
      "rawJws",
      "source",
      "recordedAt",
      "updatedAt",
    ],
  },
};

const SUBSCRIPTION: IapEntitySchema = {
  name: "IapSubscription",
  description:
    "One subscription, holding its newest transaction and newest renewal information. " +
    "Status is derived from these at read time rather than stored, so a logic fix " +
    "never needs a data migration.",
  naturalKey: "originalTransactionId",
  schema: {
    type: "object",
    properties: {
      originalTransactionId: str("The subscription chain. The natural key."),
      appUserId: str("The Base44 user this subscription belongs to."),
      subscriptionGroupIdentifier: str("The subscription group."),
      productId: str("The product of the newest transaction."),
      latestTransactionJws: str("The newest signed transaction."),
      latestRenewalInfoJws: str("The newest signed renewal information."),
      latestSignedDate: num(
        "signedDate of the newest transaction. Guards transaction updates."
      ),
      latestRenewalSignedDate: num(
        "signedDate of the newest renewal information. A separate cursor, because " +
          "renewal information arrives independently of the transaction."
      ),
      appleStatus: num("Apple's own status code: 1 active, 2 expired, 3 billing retry, 4 grace, 5 revoked."),
      environment: str("Sandbox, Production or Xcode."),
      recordedAt: num("When the SDK first stored the row."),
      updatedAt: num("When the SDK last changed the row."),
    },
    required: ["originalTransactionId", "environment", "recordedAt", "updatedAt"],
  },
};

const NOTIFICATION: IapEntitySchema = {
  name: "IapNotification",
  description:
    "One App Store Server Notification, stored raw before anything is applied. " +
    "The outcome field doubles as a commit flag: 'error' means claimed but not yet " +
    "applied, so Apple's retry re-applies it instead of being told it is a duplicate.",
  naturalKey: "notificationUUID",
  schema: {
    type: "object",
    properties: {
      notificationUUID: str(
        "Apple's unique id. A resend keeps the same value, which is what makes " +
          "de-duplication possible. The natural key."
      ),
      notificationType: str("What happened, e.g. DID_RENEW. An open set — Apple adds values."),
      subtype: str("A refinement of the type, e.g. BILLING_RECOVERY."),
      signedDate: num("When Apple signed the notification."),
      receivedAt: num("When the SDK received it."),
      originalTransactionId: str("The subscription chain involved."),
      transactionId: str("The transaction involved."),
      environment: str("Sandbox, Production or Xcode."),
      rawSignedPayload: str("The envelope exactly as received."),
      outcome: str(
        "error (claimed, not yet applied), applied, duplicate, stale, unhandled or unknown_type."
      ),
      attempts: num("How many delivery attempts have been seen, counting Apple's retries."),
      sdkVersion: str("Which version of the module wrote the row."),
    },
    required: [
      "notificationUUID",
      "notificationType",
      "signedDate",
      "receivedAt",
      "environment",
      "rawSignedPayload",
      "outcome",
      "attempts",
      "sdkVersion",
    ],
  },
};

const CONSUMPTION_REQUEST: IapEntitySchema = {
  name: "IapConsumptionRequest",
  description:
    "One refund request Apple wants consumption data for. Apple allows 12 hours to " +
    "answer in production and only 5 minutes in sandbox, and only wants an answer if " +
    "the customer consented to sharing the data.",
  naturalKey: "transactionId",
  schema: {
    type: "object",
    properties: {
      transactionId: str("The transaction being disputed. The natural key."),
      originalTransactionId: str("The subscription chain, when there is one."),
      appUserId: str("The Base44 user who bought it."),
      consumptionRequestReason: str(
        "UNINTENDED_PURCHASE, FULFILLMENT_ISSUE, UNSATISFIED_WITH_PURCHASE, LEGAL or OTHER."
      ),
      receivedAt: num("When the request arrived."),
      deadlineAt: num("When Apple stops accepting an answer."),
      requestSignedDate: num("signedDate of the request. Guards request updates."),
      respondedAt: num("When an answer was sent."),
      response: obj("The body that was sent to Apple."),
      outcome: str("REFUND, REFUND_DECLINED or REFUND_REVERSED, from a later notification."),
      outcomeSignedDate: num("signedDate of the payload that set the outcome."),
      environment: str("Sandbox, Production or Xcode."),
      updatedAt: num("When the SDK last changed the row."),
    },
    required: [
      "transactionId",
      "receivedAt",
      "deadlineAt",
      "requestSignedDate",
      "environment",
      "updatedAt",
    ],
  },
};

/**
 * The four entity definitions, in the order they should be created.
 *
 * Create these once in the app, with exactly these names. The SDK looks each
 * one up by name and fails loudly rather than quietly losing purchase data if
 * one is missing or has dropped a field.
 *
 * @example
 * ```typescript
 * // Print the definitions to create in the app
 * import { IAP_ENTITY_SCHEMAS } from "@base44/sdk/iap";
 *
 * for (const entity of IAP_ENTITY_SCHEMAS) {
 *   console.log(entity.name, Object.keys(entity.schema.properties).length, "fields");
 * }
 * ```
 */
export const IAP_ENTITY_SCHEMAS: readonly IapEntitySchema[] = [
  TRANSACTION,
  SUBSCRIPTION,
  NOTIFICATION,
  CONSUMPTION_REQUEST,
];

/** The entity names, for iteration and health checks. */
export const IAP_ENTITY_NAMES: readonly IapEntityName[] = IAP_ENTITY_SCHEMAS.map(
  (entity) => entity.name
);

/**
 * What the app owner has to do in App Store Connect and Base44, in order.
 *
 * Written for a person to follow, and for the app-generating model to repeat
 * back. None of it can be done from inside the SDK.
 */
export const IAP_SETUP_CHECKLIST: readonly string[] = [
  "Create the four entities listed in IAP_ENTITY_SCHEMAS, with exactly those names.",
  "In App Store Connect, open App Information and copy the numeric Apple ID. " +
    "That is `appAppleId` — it is not the bundle id.",
  "In App Store Connect, under App Store Server Notifications, set BOTH the " +
    "Production and Sandbox URLs to your notification function, using version 2. " +
    "If only Production is set, sandbox notifications go there too; if only Sandbox " +
    "is set, production sends nothing at all.",
  "List every product you sell in the `products` configuration, with its type. " +
    "A non-renewing subscription also needs `nonRenewingDurationDays`, because Apple " +
    "never expires those.",
  "Optionally, create an In-App Purchase key in App Store Connect under Users and " +
    "Access, Integrations, and store it in Base44 secrets. It is only needed to answer " +
    "refund-consumption requests and to send test notifications.",
  "Send a test notification to confirm the webhook is reachable before going live.",
];
