/**
 * Configuration validation.
 *
 * Runs once, when the client is created, and refuses to build a client it
 * cannot operate correctly. Failing at deploy time is the whole point: the
 * alternative is discovering a missing `appAppleId` when Apple sends the first
 * refund notification.
 *
 * @internal
 */
import { IapConfigError } from "./errors.js";
import type { IapConfig, IapProductConfig } from "./iap.types.js";
import type { IapServerApiConfig } from "./server-api/server-api.types.js";

/** A validated configuration, with every default filled in. */
export interface ResolvedIapConfig {
  readonly bundleId: string;
  readonly appAppleId: number;
  readonly products: Readonly<Record<string, IapProductConfig>>;
  readonly testMode: boolean;
  readonly allowLocalTesting: boolean;
  readonly serverApi?: IapServerApiConfig;
  readonly verifier: "apple" | "builtin";
}

const PRODUCT_TYPES = new Set<IapProductConfig["type"]>([
  "consumable",
  "nonConsumable",
  "nonRenewingSubscription",
  "autoRenewableSubscription",
]);

function invalid(message: string): never {
  throw new IapConfigError("IAP_INVALID_CONFIG", message);
}

/**
 * Validates a configuration and fills in defaults.
 *
 * @throws {IapConfigError} `IAP_INVALID_CONFIG` for anything malformed, or
 * `IAP_ONLINE_CHECKS_UNSUPPORTED` when online certificate checks are asked for.
 */
export function resolveConfig(config: IapConfig): ResolvedIapConfig {
  if (!config || typeof config !== "object") {
    invalid("an in-app purchase configuration object is required");
  }

  if (typeof config.bundleId !== "string" || config.bundleId.trim().length === 0) {
    invalid("'bundleId' is required, e.g. \"com.example.app\"");
  }

  // A very common mix-up: passing the bundle id where the numeric id belongs.
  if (typeof config.appAppleId === "string") {
    invalid(
      "'appAppleId' must be a number — the numeric App Store id from App Store " +
        "Connect under App Information, not the bundle id"
    );
  }
  if (
    typeof config.appAppleId !== "number" ||
    !Number.isInteger(config.appAppleId) ||
    config.appAppleId <= 0
  ) {
    invalid("'appAppleId' must be a positive integer, e.g. 1234567890");
  }

  if (!config.products || typeof config.products !== "object") {
    invalid("'products' is required, keyed by product identifier");
  }

  for (const [productId, product] of Object.entries(config.products)) {
    if (!product || typeof product !== "object") {
      invalid(`product ${JSON.stringify(productId)} must be an object`);
    }
    if (!PRODUCT_TYPES.has(product.type)) {
      invalid(
        `product ${JSON.stringify(productId)} has type ${JSON.stringify(
          product.type
        )}; expected one of ${[...PRODUCT_TYPES].join(", ")}`
      );
    }
    // Apple never expires a non-renewing subscription, so this number is the
    // only thing that decides when access ends. Missing it would silently
    // grant the product forever.
    if (product.type === "nonRenewingSubscription") {
      const days = product.nonRenewingDurationDays;
      if (typeof days !== "number" || !Number.isFinite(days) || days <= 0) {
        invalid(
          `product ${JSON.stringify(productId)} is a nonRenewingSubscription, so it ` +
            "needs 'nonRenewingDurationDays' — Apple does not expire these, so the " +
            "app decides how long they last"
        );
      }
    }
  }

  // `null` is treated as absent, not as invalid: a secret that was never set
  // arrives that way, and the right answer then is "the API is not configured"
  // — which the call itself reports clearly — rather than refusing to start.
  if (
    config.verifier !== undefined &&
    config.verifier !== "apple" &&
    config.verifier !== "builtin"
  ) {
    invalid(`'verifier' must be "apple" or "builtin"; got ${JSON.stringify(config.verifier)}`);
  }

  if (config.serverApi !== undefined && config.serverApi !== null) {
    const api = config.serverApi;
    if (typeof api !== "object") {
      invalid("'serverApi' must be an object, or left out entirely");
    }
    for (const field of ["keyId", "issuerId", "privateKeyP8"] as const) {
      if (typeof api[field] !== "string" || api[field].trim().length === 0) {
        invalid(`'serverApi.${field}' is required when serverApi is supplied`);
      }
    }
    if (!api.privateKeyP8.includes("PRIVATE KEY")) {
      invalid(
        "'serverApi.privateKeyP8' does not look like a .p8 file. Pass its whole " +
          "contents, including the BEGIN and END lines."
      );
    }
  }

  if (config.onlineChecks === true) {
    throw new IapConfigError(
      "IAP_ONLINE_CHECKS_UNSUPPORTED",
      "'onlineChecks' asks for certificate revocation lookups, which this version " +
        "does not implement. Leave it unset. Certificate validity is evaluated at " +
        "each payload's own signedDate, which is what Apple's own library does with " +
        "online checks off."
    );
  }

  return {
    bundleId: config.bundleId,
    appAppleId: config.appAppleId,
    products: { ...config.products },
    testMode: config.testMode === true,
    allowLocalTesting: config.allowLocalTesting === true,
    serverApi: config.serverApi ?? undefined,
    verifier: config.verifier ?? "apple",
  };
}
