import { normalizeServerUrl } from "./server-url.js";
import { createWebhooks } from "./modules/webhooks.js";
import type { PlatformServer, PlatformServerOptions } from "./server.types.js";

/** Create a server platform client, authenticated with a workspace API key. Performs no network requests. */
export function createPlatformServer(options: PlatformServerOptions): PlatformServer {
  if (!options.apiKey) throw new TypeError("apiKey is required");
  normalizeServerUrl(options.serverUrl);
  return Object.freeze({
    webhooks: Object.freeze(createWebhooks()),
  });
}
