import type { WebhooksModule } from "./modules/webhooks.types.js";

/**
 * Options for {@linkcode createPlatformServer | createPlatformServer()}.
 *
 * The server client runs on your backend and holds your workspace API key. Never pass these options
 * to code that runs in the browser.
 */
export interface PlatformServerOptions {
  /**
   * Origin of the Base44 API, such as `https://base44.app`.
   *
   * It must be an origin with no path, query, fragment, or credentials.
   */
  serverUrl: string;
  /**
   * Your workspace API key.
   *
   * Keep it on your server. The browser client never needs it.
   */
  apiKey: string;
}

/**
 * The platform server client.
 *
 * Provides access to the platform's server modules.
 */
export interface PlatformServer {
  /** [Webhooks module](/developers/references/platform-sdk/docs/interfaces/webhooks) for receiving the events Base44 sends to your server. */
  readonly webhooks: WebhooksModule;
}
