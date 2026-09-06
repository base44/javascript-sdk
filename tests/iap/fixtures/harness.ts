// Builds a complete IAP client over an in-memory store and a test certificate
// chain, so the whole ingestion path can be driven without a network.
import type { Base44Client } from "../../../src/client.types.ts";
import { createIapClient } from "../../../src/iap/index.ts";
import type { IapConfig, IapModule } from "../../../src/iap/iap.types.ts";
import type { IapEvent } from "../../../src/iap/events/events.types.ts";
import { FakeEntities, type FakeEntitiesOptions } from "./fake-entities.ts";
import { signJws, type SignJwsOptions } from "./sign-jws.ts";
import { trustAnchorsFor, validChain, type TestChain } from "./test-chain.ts";

export const BUNDLE_ID = "com.example.app";
export const APP_APPLE_ID = 1234567890;

export const BASE_PRODUCTS: IapConfig["products"] = {
  pro_monthly: { type: "autoRenewableSubscription", subscriptionGroupId: "21234567" },
  pro_yearly: { type: "autoRenewableSubscription", subscriptionGroupId: "21234567" },
  coins_100: { type: "consumable" },
  lifetime: { type: "nonConsumable" },
  season_pass: { type: "nonRenewingSubscription", nonRenewingDurationDays: 90 },
};

export interface Harness {
  readonly iap: IapModule;
  readonly fake: FakeEntities;
  readonly chain: TestChain;
  readonly events: IapEvent[];
  readonly now: () => number;
  setNow(value: number): void;
}

export interface HarnessOptions {
  readonly config?: Partial<IapConfig>;
  readonly entities?: FakeEntitiesOptions;
  readonly storeMode?: "query-guard" | "natural-id";
  readonly startAt?: number;
}

export async function createHarness(
  options: HarnessOptions = {}
): Promise<Harness> {
  const chain = await validChain();
  const fake = new FakeEntities(options.entities);
  let clockValue = options.startAt ?? Date.UTC(2026, 8, 3, 12, 0, 0);

  const base44 = {
    get asServiceRole() {
      return { entities: fake.module };
    },
  } as unknown as Base44Client;

  const iap = createIapClient({
    base44,
    config: {
      bundleId: BUNDLE_ID,
      appAppleId: APP_APPLE_ID,
      products: BASE_PRODUCTS,
      // Both implementations must satisfy the same tests. IAP_TEST_VERIFIER
      // runs the whole suite against the other one.
      verifier:
        (process.env.IAP_TEST_VERIFIER as "apple" | "builtin" | undefined) ??
        undefined,
      ...options.config,
    },
    internal: {
      roots: trustAnchorsFor(chain),
      clock: () => clockValue,
      storeMode: options.storeMode,
    },
  });

  const events: IapEvent[] = [];
  iap.onEvent((event) => {
    events.push(event);
  });

  return {
    iap,
    fake,
    chain,
    events,
    now: () => clockValue,
    setNow(value: number) {
      clockValue = value;
    },
  };
}

/** A signed transaction payload with sensible defaults. */
export function transactionPayload(overrides: Record<string, unknown> = {}) {
  return {
    transactionId: "2000000000000001",
    originalTransactionId: "2000000000000001",
    bundleId: BUNDLE_ID,
    appAppleId: APP_APPLE_ID,
    productId: "pro_monthly",
    type: "Auto-Renewable Subscription",
    subscriptionGroupIdentifier: "21234567",
    environment: "Production",
    signedDate: Date.UTC(2026, 8, 3),
    purchaseDate: Date.UTC(2026, 8, 3),
    expiresDate: Date.UTC(2026, 9, 3),
    inAppOwnershipType: "PURCHASED",
    transactionReason: "PURCHASE",
    ...overrides,
  };
}

/** A signed renewal-info payload with sensible defaults. */
export function renewalPayload(overrides: Record<string, unknown> = {}) {
  return {
    originalTransactionId: "2000000000000001",
    productId: "pro_monthly",
    autoRenewProductId: "pro_monthly",
    autoRenewStatus: 1,
    renewalDate: Date.UTC(2026, 9, 3),
    environment: "Production",
    signedDate: Date.UTC(2026, 8, 3),
    ...overrides,
  };
}

export interface NotificationOptions {
  readonly notificationType: string;
  readonly subtype?: string;
  readonly notificationUUID?: string;
  readonly signedDate?: number;
  readonly transaction?: Record<string, unknown> | null;
  readonly renewal?: Record<string, unknown> | null;
  readonly data?: Record<string, unknown>;
  readonly summary?: Record<string, unknown>;
  readonly environment?: string;
  readonly jws?: SignJwsOptions;
}

let uuidCounter = 0;

/** Builds a signed notification envelope wrapping signed inner tokens. */
export async function notification(
  harness: Harness,
  options: NotificationOptions
): Promise<string> {
  const environment = options.environment ?? "Production";
  const signedDate = options.signedDate ?? Date.UTC(2026, 8, 3);

  uuidCounter += 1;
  const notificationUUID =
    options.notificationUUID ??
    `00000000-0000-4000-8000-${String(uuidCounter).padStart(12, "0")}`;

  if (options.summary) {
    return signJws(
      harness.chain,
      {
        notificationType: options.notificationType,
        subtype: options.subtype,
        notificationUUID,
        version: "2.0",
        signedDate,
        summary: {
          environment,
          appAppleId: APP_APPLE_ID,
          bundleId: BUNDLE_ID,
          ...options.summary,
        },
      },
      options.jws
    );
  }

  const data: Record<string, unknown> = {
    appAppleId: environment === "Production" ? APP_APPLE_ID : undefined,
    bundleId: BUNDLE_ID,
    bundleVersion: "42",
    environment,
    ...options.data,
  };

  if (options.transaction !== null) {
    data.signedTransactionInfo = await signJws(
      harness.chain,
      transactionPayload({ environment, signedDate, ...options.transaction })
    );
  }
  if (options.renewal) {
    data.signedRenewalInfo = await signJws(
      harness.chain,
      renewalPayload({ environment, signedDate, ...options.renewal })
    );
  }

  return signJws(
    harness.chain,
    {
      notificationType: options.notificationType,
      subtype: options.subtype,
      notificationUUID,
      version: "2.0",
      signedDate,
      data,
    },
    options.jws
  );
}
