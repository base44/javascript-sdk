/**
 * What verification needs to know about the app, and how to read Apple's
 * `environment` field.
 *
 * The checks themselves — bundle id, app id, environment — are done by Apple's
 * library. What remains here is the configuration shape it is built from, and
 * a tolerant parse of the environment value, which Apple's own documentation
 * spells inconsistently across pages.
 *
 * @internal
 */
import type { IapEnvironment } from "./verify.types.js";

/** What the verifier needs from the module's configuration. */
export interface PayloadCheckConfig {
  /** The app's bundle identifier, e.g. `"com.example.app"`. */
  readonly bundleId: string;
  /** The app's numeric App Store id. Required by Apple's verifier in production. */
  readonly appAppleId: number;
  /** Whether sandbox tokens are accepted. */
  readonly testMode: boolean;
  /** Whether Xcode-signed tokens are accepted. */
  readonly allowLocalTesting: boolean;
}

/**
 * Normalises Apple's `environment` value to one of the canonical three.
 *
 * Case-insensitive, because Apple's documentation is not consistent about it.
 * Returns `undefined` for anything that is not an environment at all.
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
