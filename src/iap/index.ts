/**
 * Apple in-app purchase support — the `@base44/sdk/iap` entry point.
 *
 * Kept behind its own subpath deliberately. Verification carries certificate
 * parsing and cryptography that only a backend function ever runs, and the
 * main entry point is imported by browsers and by React Native. The types are
 * re-exported from `@base44/sdk` as well, where they cost nothing, so shared
 * front-end code can name them without pulling any of this in.
 */
import type { Base44Client } from "../client.types.js";
import { appAccountTokenFor } from "./account-token.js";
import { resolveConfig } from "./config.js";
import { createVerifier } from "./verify/verifier.js";
import { createAppleVerifier } from "./verify/apple-verifier.js";
import type { AppleRoot } from "./verify/apple-roots.js";
import { systemClock, type Clock } from "./runtime/clock.js";
import { createEmitter } from "./events/emitter.js";
import type { IapEventHandler } from "./events/events.types.js";
import { createEntitiesStore } from "./store/entities-store.js";
import type { IapStoreMode } from "./store/store.types.js";
import { IAP_SETUP_CHECKLIST } from "./store/schemas.js";
import {
  handleNotification,
  handleSignedPayload,
  type IngestContext,
} from "./ingest/notifications.js";
import { createReader } from "./read/read.js";
import { createServerApiClient } from "./server-api/client.js";
import { recordTransaction, syncEntitlements } from "./ingest/device.js";
import type {
  RecordTransactionOptions,
  SyncPayload,
} from "./ingest/device.types.js";
import type { IapConfig, IapModule, IapSetupReport } from "./iap.types.js";

/** Test seams. Not part of the public contract. @internal */
export interface IapInternalOptions {
  /**
   * Trust anchors to pin against, replacing Apple's real roots.
   *
   * For this SDK's own tests. An app must never be able to add a root, which
   * is why this is not reachable from {@link IapConfig}.
   */
  readonly roots?: readonly AppleRoot[];
  /** The clock. */
  readonly clock?: Clock;
  /**
   * The `fetch` used for App Store Server API calls.
   *
   * Injected for tests: `nock` hooks Node's http module and does not intercept
   * native `fetch`, which is what this client uses.
   */
  readonly fetchImpl?: typeof fetch;
  /**
   * How the store addresses rows.
   *
   * Defaults to `"query-guard"`, which is correct whether or not the backend
   * honours a caller-supplied record id. `"natural-id"` is one round trip
   * cheaper per insert, but only safe once that has been confirmed — on a
   * backend that ignores the id, de-duplication would never fire.
   */
  readonly storeMode?: IapStoreMode;
}

/** Inputs to {@linkcode createIapClient | createIapClient()}. */
export interface CreateIapClientOptions {
  /**
   * A Base44 client from
   * {@linkcode createClientFromRequest | createClientFromRequest()}.
   *
   * Purchase records are stored in the app's own entities with service-role
   * access, so the client must come from an incoming backend-function request.
   */
  base44: Base44Client;
  /** How the module behaves for this app. */
  config: IapConfig;
  /** @internal */
  internal?: IapInternalOptions;
}

/**
 * Creates the in-app purchase module for one app.
 *
 * Validates the configuration immediately and throws if it cannot be operated
 * correctly, so a mistake surfaces on deploy rather than on Apple's first
 * notification. Creating a client does no I/O, so building one per request is
 * both correct and cheap.
 *
 * @param options - The Base44 client and the app's purchase configuration.
 * @returns The in-app purchase module.
 * @throws {Error} An `IapConfigError` when the configuration is invalid or asks for an unsupported option.
 *
 * @example
 * ```typescript
 * // Verify a purchase in a backend function
 * import { createClientFromRequest } from "npm:@base44/sdk";
 * import { createIapClient } from "npm:@base44/sdk/iap";
 *
 * Deno.serve(async (req) => {
 *   const iap = createIapClient({
 *     base44: createClientFromRequest(req),
 *     config: {
 *       bundleId: "com.example.app",
 *       appAppleId: 1234567890,
 *       products: { pro_monthly: { type: "autoRenewableSubscription" } },
 *     },
 *   });
 *
 *   const { jws } = await req.json();
 *   const transaction = await iap.verifyTransaction(jws);
 *   return Response.json({ productId: transaction.productId });
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Accept sandbox purchases while testing
 * const iap = createIapClient({
 *   base44,
 *   config: {
 *     bundleId: "com.example.app",
 *     appAppleId: 1234567890,
 *     products: { coins_100: { type: "consumable" } },
 *     testMode: true,
 *   },
 * });
 * ```
 */
export function createIapClient(options: CreateIapClientOptions): IapModule {
  if (!options || !options.base44) {
    throw new TypeError(
      "createIapClient needs a Base44 client — create one with createClientFromRequest(request)"
    );
  }

  const config = resolveConfig(options.config);
  const clock = options.internal?.clock ?? systemClock;

  // Both implementations satisfy the same interface, so nothing downstream
  // knows or cares which one ran.
  const verifier =
    config.verifier === "apple"
      ? createAppleVerifier({ config, roots: options.internal?.roots })
      : createVerifier({ config, roots: options.internal?.roots, clock });

  const store = createEntitiesStore({
    // Reached lazily: the service-role accessor throws when the client has no
    // service credentials, and constructing an IAP client must not.
    getEntities: () => options.base44.asServiceRole.entities,
    mode: options.internal?.storeMode,
    clock,
  });

  const emitter = createEmitter();

  const context: IngestContext = { store, verifier, config, clock, emitter };

  const reader = createReader({
    store,
    verifier,
    config,
    clock,
    report: (what, error) => {
      // A read that failed is not the same as a customer with no purchases,
      // and only one of the two is a problem. Saying so is what stops an app
      // whose entities were never created from looking like an app with no
      // paying customers.
      console.warn(
        `[base44 iap] ${what}`,
        error instanceof Error ? error.message : error ?? ""
      );
    },
  });

  return {
    verifyTransaction: verifier.verifyTransaction,
    verifyRenewalInfo: verifier.verifyRenewalInfo,
    verifyNotification: verifier.verifyNotification,
    appAccountTokenFor,

    serverApi: createServerApiClient({
      config: config.serverApi,
      bundleId: config.bundleId,
      clock,
      // A sandbox app's transactions live in the sandbox environment, so try
      // it first there and save a round trip.
      preferSandbox: config.testMode,
      fetchImpl: options.internal?.fetchImpl,
    }),

    hasActiveSubscription: reader.hasActiveSubscription,
    getSubscriptionState: reader.getSubscriptionState,
    getEntitlements: reader.getEntitlements,
    getPurchase: reader.getPurchase,
    listTransactions: reader.listTransactions,
    listRefunds: reader.listRefunds,
    listPendingConsumptionRequests: reader.listPendingConsumptionRequests,

    recordTransaction: (jws: string, recordOptions?: RecordTransactionOptions) =>
      recordTransaction(context, jws, recordOptions),
    syncEntitlements: (payload: SyncPayload, syncOptions?: RecordTransactionOptions) =>
      syncEntitlements(context, reader, payload, syncOptions),

    handleNotification: (request: Request) => handleNotification(context, request),
    handleSignedPayload: (signedPayload: string) =>
      handleSignedPayload(context, signedPayload),
    onEvent: (handler: IapEventHandler) => emitter.onEvent(handler),

    async checkSetup(): Promise<IapSetupReport> {
      // Never throws: this is what a status page calls, and an app whose
      // entities were never created looks identical to one with no customers.
      try {
        const health = await store.healthcheck();
        return {
          ok: health.ok,
          missingEntities: health.missing,
          checklist: IAP_SETUP_CHECKLIST,
        };
      } catch {
        return {
          ok: false,
          missingEntities: [],
          checklist: IAP_SETUP_CHECKLIST,
        };
      }
    },
  };
}

export { appAccountTokenFor, IAP_APP_ACCOUNT_TOKEN_NAMESPACE } from "./account-token.js";
export {
  IapApiError,
  IapConfigError,
  IapError,
  IapSetupError,
  IapStoreError,
  IapVerificationError,
} from "./errors.js";
export { IAP_MODULE_VERSION } from "./version.js";

export {
  IAP_ENTITY_NAMES,
  IAP_ENTITY_SCHEMAS,
  IAP_SETUP_CHECKLIST,
} from "./store/schemas.js";

export type {
  IapConfig,
  IapConfiguredProductType,
  IapModule,
  IapProductConfig,
  IapSetupReport,
} from "./iap.types.js";
export type {
  IapEvent,
  IapEventHandler,
  IapEventType,
  IapExpiryReason,
  IapRenewReason,
  IapStartReason,
} from "./events/events.types.js";
export type { HandleNotificationResult } from "./ingest/notifications.js";
export type {
  ConsumptionRequestBody,
  IapDeliveryStatus,
  IapRefundPreference,
  IapServerApiConfig,
  IapServerApiModule,
  SendAttempt,
  SendAttemptResult,
  TestNotificationResult,
  TestNotificationStatus,
} from "./server-api/server-api.types.js";
export type {
  RecordTransactionOptions,
  RecordTransactionResult,
  SyncPayload,
  SyncResult,
} from "./ingest/device.types.js";
export type {
  EntitlementQuery,
  Entitlements,
  IapExpirationReason,
  IapRevocation,
  IapSubscriptionOffer,
  IapSubscriptionStatus,
  OwnedNonConsumable,
  OwnedNonRenewingSubscription,
  SubscriptionQuery,
  SubscriptionState,
  TransactionQuery,
} from "./read/read.types.js";
export type {
  IapEntityName,
  IapEntitySchema,
  IapSchemaField,
} from "./store/schemas.js";
export type {
  IapConsumptionOutcome,
  IapConsumptionRequestRecord,
  IapNotificationOutcome,
  IapNotificationRecord,
  IapRecordSource,
  IapSubscriptionRecord,
  IapTransactionRecord,
} from "./store/rows.types.js";
export type {
  IapApiErrorCode,
  IapConfigErrorCode,
  IapSetupErrorCode,
  IapStoreErrorCode,
  IapVerificationErrorCode,
} from "./errors.types.js";
export type {
  DecodedNotification,
  DecodedNotificationData,
  DecodedNotificationSummary,
  DecodedRenewalInfo,
  DecodedTransaction,
  IapAppleSubscriptionStatus,
  IapConsumptionRequestReason,
  IapEnvironment,
  IapExpirationIntent,
  IapOfferDiscountType,
  IapOfferType,
  IapOwnershipType,
  IapProductType,
  IapRevocationType,
  IapTransactionReason,
} from "./verify/verify.types.js";
