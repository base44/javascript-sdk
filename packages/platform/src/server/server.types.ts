import type { WebhooksModule } from "./modules/webhooks.types.js";

/** Shared configuration for server platform modules. */
export interface PlatformServerOptions {
  /** Origin of the platform service, e.g. https://base44.app. No path/query/credentials. */
  serverUrl: string;
  /** Workspace API key. Keep it on your server; never ship it to a browser. */
  apiKey: string;
}

/** Server platform client, returned by `createPlatformServer`. */
export interface PlatformServer {
  /** Verify Base44 outbound webhooks and answer the activation challenge. */
  readonly webhooks: WebhooksModule;
}
