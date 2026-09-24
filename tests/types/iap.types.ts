// Compile-only checks on the in-app purchase surface.
//
// Two things are asserted here that a runtime test cannot: that the types are
// reachable from the main entry point at all (they are re-exported there as
// types only, which is what keeps the crypto out of a browser bundle), and
// that the shapes generated code must not be able to write are rejected.

import type {
  ConsumptionRequestBody,
  DecodedNotification,
  DecodedTransaction,
  Entitlements,
  IapConfig,
  IapEvent,
  IapModule,
  IapProductConfig,
  IapSetupReport,
  IapSubscriptionStatus,
  SubscriptionState,
  SyncPayload,
  SyncResult,
} from "../../src/index.js";

// The subpath is where the runtime lives.
import type { CreateIapClientOptions } from "../../src/iap/index.js";

// --- Configuration -------------------------------------------------------

const config = {
  bundleId: "com.example.app",
  appAppleId: 1234567890,
  products: {
    pro_monthly: { type: "autoRenewableSubscription", subscriptionGroupId: "21234567" },
    coins_100: { type: "consumable" },
    season_pass: { type: "nonRenewingSubscription", nonRenewingDurationDays: 90 },
  },
  testMode: true,
} satisfies IapConfig;

// @ts-expect-error the numeric App Store id is not the bundle id
const wrongAppleId: IapConfig = { ...config, appAppleId: "com.example.app" };

// @ts-expect-error "subscription" is not one of the four product types
const wrongProductType: IapProductConfig = { type: "subscription" };

// --- The gate ------------------------------------------------------------

declare const iap: IapModule;

const entitled: Promise<boolean> = iap.hasActiveSubscription("user-1");
const narrowed: Promise<boolean> = iap.hasActiveSubscription("user-1", {
  productIds: ["pro_monthly"],
  subscriptionGroupId: "21234567",
});

// @ts-expect-error a user id is required; an entitlement check is never global
const noUser = iap.hasActiveSubscription();

// @ts-expect-error the client must never be trusted about what it bought
const clientClaim = iap.hasActiveSubscription("user-1", { entitled: true });

// --- Reads ---------------------------------------------------------------

declare const state: SubscriptionState;
const status: IapSubscriptionStatus = state.status;
const isEntitled: boolean = state.entitled;
const expiry: number | null = state.expiresAt;

// @ts-expect-error status is a closed set, so a typo cannot slip through
const badStatus: IapSubscriptionStatus = "cancelled";

declare const owned: Entitlements;
const unlocked: string[] = owned.nonConsumables.map((item) => item.productId);
// Consumables are deliberately absent from the shape, not merely empty.
// @ts-expect-error there is no consumables list to read
const consumables = owned.consumables;

// --- Ingestion -----------------------------------------------------------

const webhook: Promise<Response> = iap.handleNotification(new Request("https://x"));

declare const payload: SyncPayload;
const sync: Promise<SyncResult> = iap.syncEntitlements(payload, { appUserId: "user-1" });

// --- Events --------------------------------------------------------------

const stop: () => void = iap.onEvent((event: IapEvent) => {
  const kind = event.type;
  // Detail fields are optional, because not every event carries them.
  const grace: boolean | undefined = event.inGracePeriod;
  void kind;
  void grace;
});

// @ts-expect-error event types are a closed set
const badEvent: IapEvent = { ...({} as IapEvent), type: "purchase.happened" };

// --- Decoded payloads keep unknown fields --------------------------------

declare const transaction: DecodedTransaction;
// An index signature, so a field Apple adds later is still readable.
const future: unknown = transaction.somethingAppleAddsIn2027;

declare const notification: DecodedNotification;
const uuid: string = notification.notificationUUID;
const innerProduct: string | undefined = notification.data?.transactionInfo?.productId;
// The verified raw token, which is what gets stored.
const innerJws: string | undefined = notification.data?.transactionInfoJws;

// --- Server API ----------------------------------------------------------

const consumption = {
  customerConsented: true,
  deliveryStatus: "DELIVERED",
  sampleContentProvided: true,
  consumptionPercentage: 100000,
} satisfies ConsumptionRequestBody;

const withoutConsent: ConsumptionRequestBody = {
  // @ts-expect-error consent cannot be false; Apple requires it and so do we
  customerConsented: false,
  deliveryStatus: "DELIVERED",
  sampleContentProvided: false,
};

declare const setup: IapSetupReport;
const missing: string[] = setup.missingEntities;

declare const options: CreateIapClientOptions;
const configured: IapConfig = options.config;

void [
  config, wrongAppleId, wrongProductType, entitled, narrowed, noUser, clientClaim,
  status, isEntitled, expiry, badStatus, unlocked, consumables, webhook, sync,
  stop, badEvent, future, uuid, innerProduct, innerJws, consumption,
  withoutConsent, missing, configured,
];
