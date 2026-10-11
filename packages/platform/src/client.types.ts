import type { BuilderModule } from "./modules/builder.types.js";

/**
 * The platform client.
 *
 * Provides access to the platform's modules.
 */
export interface PlatformClient {
  /** [Builder module](/developers/references/platform-sdk/docs/interfaces/builder) for following the AI chat in your users' apps live. */
  readonly builder: BuilderModule;
}
