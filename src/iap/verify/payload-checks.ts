/**
 * The payload half of verification.
 *
 * A valid signature only proves Apple signed the token. It does not prove the
 * token is for *this* app, or from an environment this app accepts. Apple's own
 * instruction (WWDC23 session 10143) is explicit: "Check the appAppleId and
 * bundleId to confirm the notification is targeted for your correct
 * application. Check the environment matches the expected environment."
 *
 * @internal
 */
import { IapVerificationError } from "../errors.js";
import type { IapEnvironment } from "./verify.types.js";

/** What the payload checks need from the module's configuration. */
export interface PayloadCheckConfig {
  /** The app's bundle identifier, e.g. `"com.example.app"`. */
  readonly bundleId: string;
  /** The app's numeric App Store id. Required by Apple's own verifier in production. */
  readonly appAppleId: number;
  /** Whether sandbox tokens are accepted. */
  readonly testMode: boolean;
  /** Whether Xcode-signed tokens are accepted. */
  readonly allowLocalTesting: boolean;
}

/**
 * Normalises Apple's `environment` value.
 *
 * Apple's documentation spells this inconsistently across pages, so the parse
 * is case-insensitive and the result is always one of the canonical three.
 * Returns `undefined` for a value that is not an environment at all.
 */
export function normalizeEnvironment(value: unknown): IapEnvironment | undefined {
  if (typeof value !== "string") return undefined;
  switch (value.trim().toLowerCase()) {
    case "sandbox":
      return "Sandbox";
    case "production":
      return "Production";
    case "xcode":
      return "Xcode";
    default:
      return undefined;
  }
}

/**
 * Rejects a token whose environment this app does not accept.
 *
 * Production is always accepted. Sandbox needs `testMode`, and Xcode needs
 * `allowLocalTesting` — so a production deployment with both flags off will
 * only ever honour real purchases.
 */
export function checkEnvironment(
  environment: IapEnvironment | undefined,
  config: PayloadCheckConfig
): IapEnvironment {
  if (!environment) {
    throw new IapVerificationError(
      "INVALID_ENVIRONMENT",
      "the payload carries no recognisable 'environment'"
    );
  }
  if (environment === "Sandbox" && !config.testMode) {
    throw new IapVerificationError(
      "INVALID_ENVIRONMENT",
      "this token is from the Sandbox environment, which this app does not accept " +
        "(set testMode to accept it)"
    );
  }
  if (environment === "Xcode" && !config.allowLocalTesting) {
    throw new IapVerificationError(
      "INVALID_ENVIRONMENT",
      "this token is from Xcode's local StoreKit testing, which this app does not " +
        "accept (set allowLocalTesting to accept it)"
    );
  }
  return environment;
}

/**
 * Rejects a token issued for another app.
 *
 * `bundleId` is checked whenever the payload carries one. `appAppleId` is
 * checked only in production, because Apple omits it from sandbox payloads
 * entirely — requiring it there would reject every sandbox token.
 */
export function checkAppIdentifiers(
  payload: Readonly<Record<string, unknown>>,
  environment: IapEnvironment,
  config: PayloadCheckConfig
): void {
  if (payload.bundleId !== undefined && payload.bundleId !== config.bundleId) {
    throw new IapVerificationError(
      "INVALID_APP_IDENTIFIER",
      `the token's bundleId ${JSON.stringify(payload.bundleId)} does not match ` +
        `this app's ${JSON.stringify(config.bundleId)}`
    );
  }

  if (environment !== "Production") return;

  if (payload.appAppleId === undefined) {
    throw new IapVerificationError(
      "INVALID_APP_IDENTIFIER",
      "a production token must carry an appAppleId, and this one does not"
    );
  }
  if (Number(payload.appAppleId) !== config.appAppleId) {
    throw new IapVerificationError(
      "INVALID_APP_IDENTIFIER",
      `the token's appAppleId ${String(payload.appAppleId)} does not match ` +
        `this app's ${config.appAppleId}`
    );
  }
}
