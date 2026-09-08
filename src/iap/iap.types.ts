/**
 * Apple in-app purchase support for Base44 backend functions.
 *
 * Base44's iOS shell already speaks StoreKit 2 on the device. This module is
 * the server half: it verifies what Apple signed, so your backend can decide
 * who has paid for what without ever trusting the client.
 *
 * Everything here runs inside your app's own backend functions. Nothing is
 * sent to a Base44 service, and no Apple credentials are needed to verify a
 * purchase.
 *
 * ## Getting a client
 *
 * The runtime lives behind a subpath, so a browser bundle never downloads
 * certificate-parsing code:
 *
 * ```typescript
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
 *   const transaction = await iap.verifyTransaction(jws);
 *   return Response.json({ productId: transaction.productId });
 * });
 * ```
 *
 * ## Authentication Modes
 *
 * This module is only available in Base44-hosted backend functions, from a
 * client created with
 * {@linkcode createClientFromRequest | createClientFromRequest()}.
 */
import type {
  DecodedNotification,
  DecodedRenewalInfo,
  DecodedTransaction,
} from "./verify/verify.types.js";
import type { IapEventHandler } from "./events/events.types.js";
import type { HandleNotificationResult } from "./ingest/notifications.js";
import type {
  RecordTransactionOptions,
  RecordTransactionResult,
  SyncPayload,
  SyncResult,
} from "./ingest/device.types.js";
import type { IapEntityName } from "./store/schemas.js";
import type {
  IapServerApiConfig,
  IapServerApiModule,
} from "./server-api/server-api.types.js";
import type {
  IapConsumptionRequestRecord,
  IapTransactionRecord,
} from "./store/rows.types.js";
import type {
  EntitlementQuery,
  Entitlements,
  SubscriptionQuery,
  SubscriptionState,
  TransactionQuery,
} from "./read/read.types.js";

/** What kind of product an identifier refers to. */
export type IapConfiguredProductType =
  /** Used up and bought again, like a pack of coins. */
  | "consumable"
  /** Bought once and owned forever, like unlocking a feature. */
  | "nonConsumable"
  /**
   * Bought for a fixed period that does not renew itself.
   *
   * Apple does not track when these end, so `nonRenewingDurationDays` is
   * required and this SDK computes the expiry from it.
   */
  | "nonRenewingSubscription"
  /** Renews itself until cancelled. */
  | "autoRenewableSubscription";

/** One product the app sells. */
export interface IapProductConfig {
  /** What kind of product this is. */
  type: IapConfiguredProductType;
  /**
   * The subscription group this product belongs to.
   *
   * Products in one group are alternatives to each other, so a customer can
   * hold only one at a time. Auto-renewable subscriptions only.
   */
  subscriptionGroupId?: string;
  /**
   * How many days a non-renewing subscription lasts.
   *
   * Required for `nonRenewingSubscription` and ignored otherwise. Apple never
   * expires these, so this number is the only thing that says when access
   * ends.
   */
  nonRenewingDurationDays?: number;
}

/**
 * How the in-app purchase module behaves for one app.
 *
 * `bundleId` and `appAppleId` are two different things and both are needed:
 * the bundle id is the reverse-DNS string like `com.example.app`, while the
 * App Store id is the number shown in App Store Connect under App Information.
 * Apple omits the numeric id from sandbox payloads, so it is only enforced
 * against production tokens.
 */
export interface IapConfig {
  /** The app's bundle identifier, e.g. `"com.example.app"`. */
  bundleId: string;
  /**
   * The app's numeric App Store id.
   *
   * Find it in App Store Connect under App Information, labelled "Apple ID".
   * It is not the bundle id.
   */
  appAppleId: number;
  /** Every product the app sells, keyed by product identifier. */
  products: Record<string, IapProductConfig>;
  /**
   * Whether purchases made in Apple's sandbox count as real.
   *
   * Turn this on while testing and off in production. With it off, a sandbox
   * token is rejected outright.
   *
   * @defaultValue `false`
   */
  testMode?: boolean;
  /**
   * Whether to accept tokens from Xcode's local StoreKit testing.
   *
   * These are signed by Xcode rather than by Apple, so they cannot be verified
   * against Apple's certificates — turning this on skips that check for them.
   * Never turn it on in production.
   *
   * @defaultValue `false`
   */
  allowLocalTesting?: boolean;
  /**
   * Credentials for calling Apple's own servers.
   *
   * Optional, and not needed to verify a purchase or check an entitlement. It
   * unlocks answering refund-consumption requests and sending test
   * notifications. Use an **In-App Purchase key** from App Store Connect, kept
   * in Base44 secrets.
   */
  serverApi?: IapServerApiConfig;
  /**
   * Whether to ask Apple's servers whether a certificate has been revoked.
   *
   * Not implemented in this version. Setting it to `true` throws when the
   * client is created, rather than quietly behaving as if it were `false`.
   *
   * @defaultValue `false`
   */
  onlineChecks?: boolean;
}

/** Whether the app is set up to store purchase data. */
export interface IapSetupReport {
  /** Whether everything the module needs exists. */
  ok: boolean;
  /**
   * Entities the app is missing.
   *
   * Create them from `IAP_ENTITY_SCHEMAS`. Until they exist, nothing can be
   * stored and every entitlement check answers "not entitled".
   */
  missingEntities: IapEntityName[];
  /** What the app owner still has to do, in order. */
  checklist: readonly string[];
}

/**
 * The in-app purchase module.
 *
 * Every method that takes a signed token throws if it cannot verify it. There
 * is no partially-verified result: a token either passed every check Apple
 * describes, or it is rejected.
 */
export interface IapModule {
  /**
   * Verifies a signed transaction and returns its contents.
   *
   * Checks the signature, walks the certificate chain to a pinned Apple root,
   * and confirms the transaction is for this app and from an environment this
   * app accepts.
   *
   * @param jws - The signed transaction, as Apple or StoreKit produced it.
   * @returns Promise resolving to the decoded transaction.
   * @throws {Error} An `IapVerificationError` when the token fails any check. Its `code` says which.
   *
   * @example Verify a purchase reported by the app
   * ```typescript
   * // Verify a purchase reported by the app
   * const transaction = await iap.verifyTransaction(jws);
   * console.log(transaction.productId, transaction.expiresDate);
   * ```
   *
   * @example Tell rejection reasons apart
   * ```typescript
   * // Tell rejection reasons apart
   * try {
   *   await iap.verifyTransaction(jws);
   * } catch (error) {
   *   if (error.code === "INVALID_APP_IDENTIFIER") {
   *     // The token is genuine, but it belongs to a different app.
   *   }
   * }
   * ```
   */
  verifyTransaction(jws: string): Promise<DecodedTransaction>;

  /**
   * Verifies signed subscription renewal information and returns its contents.
   *
   * Renewal information is where a subscription's future lives — whether it
   * will renew, what it will renew to, and whether it is inside a billing
   * grace period. A plain transaction carries none of that.
   *
   * @param jws - The signed renewal information.
   * @returns Promise resolving to the decoded renewal information.
   * @throws {Error} An `IapVerificationError` when the token fails any check.
   *
   * @example
   * ```typescript
   * // Read whether a subscription will renew
   * const renewal = await iap.verifyRenewalInfo(jws);
   * const willRenew = renewal.autoRenewStatus === 1;
   * ```
   */
  verifyRenewalInfo(jws: string): Promise<DecodedRenewalInfo>;

  /**
   * Verifies an App Store Server Notification and returns its contents.
   *
   * Notifications arrive as one signed envelope wrapping further signed
   * tokens. Each is verified in its own right, and the decoded transaction and
   * renewal information are returned in place of the raw strings, so no caller
   * can act on something unverified by mistake.
   *
   * @param signedPayload - The `signedPayload` value from Apple's request body.
   * @returns Promise resolving to the decoded notification.
   * @throws {Error} An `IapVerificationError` when the envelope or any inner token fails a check.
   *
   * @example
   * ```typescript
   * // Handle a notification from Apple
   * const { signedPayload } = await req.json();
   * const notification = await iap.verifyNotification(signedPayload);
   *
   * if (notification.notificationType === "REFUND") {
   *   const transactionId = notification.data?.transactionInfo?.transactionId;
   *   // Take the purchase back.
   * }
   * ```
   */
  verifyNotification(signedPayload: string): Promise<DecodedNotification>;

  /**
   * Turns a Base44 user id into the UUID to attach to a purchase.
   *
   * StoreKit lets the app tag a purchase with a UUID, and Apple signs that
   * value back into every resulting transaction — which is what makes a
   * purchase attributable to a user without trusting anything the client says.
   *
   * The mapping is a pure function, so the app, the shell and the backend all
   * derive the same UUID from the same user id with nothing stored in between.
   *
   * @param base44UserId - The Base44 user id.
   * @returns The UUID to pass to StoreKit as the purchase's account token.
   *
   * @example
   * ```typescript
   * // Derive the token the shell should attach to a purchase
   * const token = iap.appAccountTokenFor(user.id);
   * ```
   */
  appAccountTokenFor(base44UserId: string): string;

  /**
   * Handles an App Store Server Notification from Apple.
   *
   * Point your notification function at this and return what it gives you.
   * It owns the whole contract with Apple, including the status code — which
   * matters more than it looks: Apple retries a failure for up to 72 hours but
   * **never** retries a success, so a `200` sent before the data is stored
   * loses that notification permanently. This never does that.
   *
   * The payload is verified, stored raw, applied, and only then reported as
   * handled. A repeat delivery of something already handled is recognised and
   * ignored. Any storage failure produces `503`, so Apple comes back.
   *
   * @param request - The incoming request from Apple.
   * @returns Promise resolving to the response to return: `200` handled, `400` malformed, `401` unverifiable, `503` try again.
   *
   * @example
   * ```typescript
   * // The whole notification function
   * import { createClientFromRequest } from "npm:@base44/sdk";
   * import { createIapClient } from "npm:@base44/sdk/iap";
   * import { iapConfig } from "./iapConfig.ts";
   *
   * Deno.serve(async (req) => {
   *   const iap = createIapClient({ base44: createClientFromRequest(req), config: iapConfig });
   *   return await iap.handleNotification(req);
   * });
   * ```
   *
   * @example
   * ```typescript
   * // React to what arrived
   * iap.onEvent(async (event) => {
   *   if (event.type === "purchase.refund_reversed") {
   *     await reinstate(event.appUserId, event.productId);
   *   }
   * });
   *
   * return await iap.handleNotification(req);
   * ```
   */
  handleNotification(request: Request): Promise<Response>;

  /**
   * Handles a signed notification payload directly, without an HTTP request.
   *
   * Useful for replaying a payload you already stored, and for testing. It
   * runs exactly the same path as {@linkcode IapModule.handleNotification | handleNotification()},
   * including duplicate detection, so replaying something already applied
   * changes nothing.
   *
   * @param signedPayload - The `signedPayload` string from Apple's request body.
   * @returns Promise resolving to what was done, including the status a webhook would have returned.
   *
   * @example
   * ```typescript
   * // Replay a stored payload
   * const stored = await base44.asServiceRole.entities.IapNotification.get(id);
   * const result = await iap.handleSignedPayload(stored.rawSignedPayload);
   * console.log(result.status, result.outcome);
   * ```
   */
  handleSignedPayload(signedPayload: string): Promise<HandleNotificationResult>;

  /**
   * Registers a handler called after purchase data has been stored.
   *
   * Handlers run once the write has landed, so anything they do — sending an
   * email, granting a bonus, clawing back a balance — can rely on the data
   * being there. A handler that throws is reported and ignored; it can never
   * change what Apple is told.
   *
   * @param handler - Called with each event.
   * @returns A function that removes the handler.
   *
   * @example
   * ```typescript
   * // Take content back on a refund, and give it back if reversed
   * const stop = iap.onEvent(async (event) => {
   *   if (event.type === "purchase.refunded") {
   *     await revokeCoins(event.appUserId, event.productId);
   *   }
   *   if (event.type === "purchase.refund_reversed") {
   *     await grantCoins(event.appUserId, event.productId);
   *   }
   * });
   * ```
   *
   * @example
   * ```typescript
   * // Keep serving a customer whose payment failed but who is in a grace period
   * iap.onEvent((event) => {
   *   if (event.type === "subscription.billing_issue" && event.inGracePeriod) {
   *     // Apple requires full service throughout the grace period.
   *     return;
   *   }
   * });
   * ```
   */
  onEvent(handler: IapEventHandler): () => void;

  /**
   * Checks whether the app can actually store purchase data.
   *
   * Never throws, so it is safe to call from a status page. Worth calling once
   * after setup: until the four entities exist, nothing can be stored and
   * every entitlement check answers "not entitled" — which looks exactly like
   * an app with no paying customers.
   *
   * @returns Promise resolving to what exists, what is missing, and what to do about it.
   *
   * @example
   * ```typescript
   * // Confirm setup before going live
   * const report = await iap.checkSetup();
   * if (!report.ok) {
   *   console.error("missing entities:", report.missingEntities.join(", "));
   *   report.checklist.forEach((step, i) => console.log(`${i + 1}. ${step}`));
   * }
   * ```
   */
  checkSetup(): Promise<IapSetupReport>;

  /**
   * Whether a user should get a paid feature right now.
   *
   * **This is the one call a feature gate should make.** Never gate on
   * anything the client sends: a purchase is only real if Apple signed it, and
   * this is the only thing that knows whether it did.
   *
   * It never throws. No purchase, an unreadable stored token, a storage
   * failure — every one of those answers `false`, because the alternative is a
   * gate that opens when something breaks.
   *
   * Two subtleties it handles for you. A subscription in a billing **grace
   * period** counts as entitled, because Apple requires full service until the
   * grace period ends. Sandbox purchases only count when `testMode` is on, so
   * a live app cannot be unlocked with a test purchase.
   *
   * @param appUserId - The Base44 user id.
   * @param query - Optionally narrow to certain products or a subscription group.
   * @returns Promise resolving to whether the user is entitled. Never rejects.
   *
   * @example
   * ```typescript
   * // Gate a paid feature
   * if (!(await iap.hasActiveSubscription(user.id))) {
   *   return Response.json({ error: "Subscription required" }, { status: 402 });
   * }
   * ```
   *
   * @example
   * ```typescript
   * // Require one of several plans
   * const entitled = await iap.hasActiveSubscription(user.id, {
   *   productIds: ["pro_monthly", "pro_yearly"],
   * });
   * ```
   */
  hasActiveSubscription(appUserId: string, query?: EntitlementQuery): Promise<boolean>;

  /**
   * Every subscription a user holds, and where each one stands.
   *
   * A user can hold more than one: a plan they bought, a plan a family member
   * shared with them, or one per subscription group. Use this when you need to
   * show a customer their own status; use
   * {@linkcode IapModule.hasActiveSubscription | hasActiveSubscription()} to
   * gate a feature.
   *
   * @param appUserId - The Base44 user id.
   * @param query - Optionally narrow to a subscription group or product.
   * @returns Promise resolving to one entry per subscription.
   * @throws {Error} An `IapStoreError` when the data could not be read.
   *
   * @example
   * ```typescript
   * // Show a customer their subscription
   * const [subscription] = await iap.getSubscriptionState(user.id);
   * if (subscription?.status === "grace_period") {
   *   showBanner("There's a problem with your payment method.");
   * }
   * ```
   *
   * @example
   * ```typescript
   * // Notice a scheduled plan change
   * for (const state of await iap.getSubscriptionState(user.id)) {
   *   if (state.autoRenewProductId && state.autoRenewProductId !== state.productId) {
   *     console.log(`switching to ${state.autoRenewProductId} at renewal`);
   *   }
   * }
   * ```
   */
  getSubscriptionState(
    appUserId: string,
    query?: SubscriptionQuery
  ): Promise<SubscriptionState[]>;

  /**
   * Everything a user currently owns.
   *
   * The server-side counterpart of StoreKit's current entitlements: what they
   * own outright, which fixed-period purchases are still running, and every
   * subscription. Consumables never appear — once used up they are the app's
   * business to track, and Apple leaves them out too.
   *
   * @param appUserId - The Base44 user id.
   * @returns Promise resolving to what the user owns, and when it was worked out.
   * @throws {Error} An `IapStoreError` when the data could not be read.
   *
   * @example
   * ```typescript
   * // Build a customer's library
   * const owned = await iap.getEntitlements(user.id);
   * const unlocked = owned.nonConsumables.map((item) => item.productId);
   * const passes = owned.nonRenewingSubscriptions.filter((pass) => pass.active);
   * ```
   */
  getEntitlements(appUserId: string): Promise<Entitlements>;

  /**
   * One stored purchase, by Apple's transaction id.
   *
   * @param transactionId - Apple's transaction id.
   * @returns Promise resolving to the stored purchase, or `null` when there is none.
   * @throws {Error} An `IapStoreError` when the data could not be read.
   *
   * @example
   * ```typescript
   * // Look up a purchase for a support request
   * const purchase = await iap.getPurchase("2000000123456789");
   * console.log(purchase?.productId, purchase?.revocationDate);
   * ```
   */
  getPurchase(transactionId: string): Promise<IapTransactionRecord | null>;

  /**
   * A user's stored purchases, newest first.
   *
   * @param appUserId - The Base44 user id.
   * @param query - Optionally narrow by product, type, date range, environment or refund state.
   * @returns Promise resolving to the matching purchases.
   * @throws {Error} An `IapStoreError` when the data could not be read.
   *
   * @example
   * ```typescript
   * // Show this month's purchases
   * const purchases = await iap.listTransactions(user.id, {
   *   since: Date.UTC(2026, 8, 1),
   *   revoked: false,
   * });
   * ```
   */
  listTransactions(
    appUserId: string,
    query?: TransactionQuery
  ): Promise<IapTransactionRecord[]>;

  /**
   * A user's refunded or revoked purchases.
   *
   * Each row carries how much was refunded, so an app that sold a consumable
   * balance can take back the right proportion of it.
   *
   * @param appUserId - The Base44 user id.
   * @returns Promise resolving to the refunded purchases.
   * @throws {Error} An `IapStoreError` when the data could not be read.
   *
   * @example
   * ```typescript
   * // Claw back a coin balance proportionally
   * for (const refund of await iap.listRefunds(user.id)) {
   *   const share = (refund.revocationPercentage ?? 100000) / 100000;
   *   await deductCoins(user.id, refund.productId, share);
   * }
   * ```
   */
  listRefunds(appUserId: string): Promise<IapTransactionRecord[]>;

  /**
   * Refund requests Apple is still waiting on, soonest deadline first.
   *
   * Apple allows 12 hours to answer in production and only **5 minutes** in
   * sandbox, and only wants an answer if the customer consented to sharing
   * their consumption data. With no consent flow, the right thing is to ignore
   * these.
   *
   * @returns Promise resolving to the open requests, ordered by deadline.
   * @throws {Error} An `IapStoreError` when the data could not be read.
   *
   * @example
   * ```typescript
   * // See what is waiting, and how long is left
   * for (const request of await iap.listPendingConsumptionRequests()) {
   *   const minutesLeft = Math.round((request.deadlineAt - Date.now()) / 60000);
   *   console.log(request.transactionId, request.consumptionRequestReason, minutesLeft);
   * }
   * ```
   */
  listPendingConsumptionRequests(): Promise<IapConsumptionRequestRecord[]>;

  /**
   * Records a purchase the app has just made.
   *
   * **The app must not tell StoreKit the purchase is finished until this
   * resolves.** An unfinished transaction is re-delivered at the next launch,
   * so the device acts as the retry queue — and a purchase finished before the
   * server stored it is a purchase nobody can prove afterwards. If this
   * throws, deliver nothing and do not finish.
   *
   * `duplicate` is the double-delivery guard. StoreKit re-delivers an
   * unfinished transaction every launch, so a consumable should only be
   * granted when `duplicate` is `false`.
   *
   * Passing `appUserId` is worth doing: it is checked against the UUID Apple
   * signed into the transaction, so one customer cannot claim another's
   * purchase by replaying their token.
   *
   * @param jws - The signed transaction from StoreKit.
   * @param options - Optionally the Base44 user making the request.
   * @returns Promise resolving to what was stored, and whether it was already known.
   * @throws {Error} An `IapVerificationError` when the token fails a check, or an `IapStoreError` when it could not be stored.
   *
   * @example
   * ```typescript
   * // Record a purchase, then let the app finish it
   * const result = await iap.recordTransaction(jws, { appUserId: user.id });
   * if (!result.duplicate) {
   *   await grantCoins(user.id, result.decoded.productId);
   * }
   * return Response.json(result);
   * ```
   */
  recordTransaction(
    jws: string,
    options?: RecordTransactionOptions
  ): Promise<RecordTransactionResult>;

  /**
   * Reconciles what the device knows about its purchases with what the server knows.
   *
   * Call this at launch, on foreground, after any purchase, and after a
   * customer-initiated restore. It is how everything heals: a notification
   * Apple never managed to deliver, a purchase made on another device, a
   * renewal that happened while the app was closed.
   *
   * One unreadable token never fails the whole call — it is counted in
   * `skipped` and the rest are stored, because the other purchases are still
   * real. `mismatches` counts what the device believes it owns that the server
   * does not; persistently above zero means notifications are going missing.
   *
   * @param payload - What the device knows: current entitlements, unfinished transactions, and subscription status pairs.
   * @param options - Optionally the Base44 user making the request.
   * @returns Promise resolving to which transactions are stored, what the server believes, and how far the two disagreed.
   *
   * @example
   * ```typescript
   * // The launch-time sync endpoint
   * const result = await iap.syncEntitlements(await req.json(), { appUserId: user.id });
   * return Response.json(result);
   * // The app may now finish the transactions in result.recordedTransactionIds.
   * ```
   */
  syncEntitlements(
    payload: SyncPayload,
    options?: RecordTransactionOptions
  ): Promise<SyncResult>;

  /**
   * Calls to Apple's own servers.
   *
   * Always present. Every method throws until `serverApi` credentials are
   * configured, so the module's shape never depends on configuration.
   *
   * @example
   * ```typescript
   * // Confirm the webhook is reachable
   * const { testNotificationToken } = await iap.serverApi.requestTestNotification();
   * ```
   */
  serverApi: IapServerApiModule;
}
