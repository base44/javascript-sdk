import type { WebhooksModule } from "./modules/webhooks.types.js";

/**
 * The platform server client.
 *
 * Provides access to the platform's server modules.
 */
export interface PlatformServer {
  /** [Webhooks module](/developers/references/platform-sdk/docs/interfaces/webhooks) for receiving the events Base44 sends to your server. */
  readonly webhooks: WebhooksModule;
}
