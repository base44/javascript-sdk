import type { WebhooksModule } from "./modules/webhooks.types.js";

/**
 * The platform server client, with one property for each module.
 */
export interface PlatformServer {
  /** [Webhooks module](/developers/references/platform-sdk/docs/interfaces/webhooks) for receiving and verifying Base44's webhooks. */
  readonly webhooks: WebhooksModule;
}
