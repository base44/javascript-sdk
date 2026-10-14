import { normalizeServerUrl } from "./server-url.js";
import { createWebhooks } from "./modules/webhooks.js";
import type { PlatformServer, PlatformServerOptions } from "./server.types.js";

/**
 * Creates a platform server client.
 *
 * This is the entry point of the Platform SDK on your backend. Import it from
 * `@base44/platform/server`. The client gives your server access to the platform's server modules,
 * such as [`webhooks`](/developers/references/platform-sdk/docs/interfaces/webhooks). Creating it
 * makes no network requests.
 *
 * @param options - Configuration object for the client.
 * @returns A configured server client with access to the platform's server modules.
 * @throws {TypeError} When `serverUrl` isn't an HTTP or HTTPS origin, or `apiKey` is empty.
 *
 * @example
 * ```typescript
 * // Create a server client on your backend
 * import { createPlatformServer } from '@base44/platform/server';
 *
 * const platform = createPlatformServer({
 *   serverUrl: 'https://base44.app',
 *   apiKey: process.env.BASE44_API_KEY,
 * });
 *
 * // Use the client to receive webhooks
 * export const POST = platform.webhooks.createHandler({
 *   publicKeys: process.env.BASE44_WEBHOOK_PUBLIC_KEYS,
 *   on: {
 *     'app.deleted.v1': async (event) => removeApp(event.data.app_id),
 *   },
 * });
 * ```
 */
export function createPlatformServer(options: PlatformServerOptions): PlatformServer {
  if (!options.apiKey) throw new TypeError("apiKey is required");
  normalizeServerUrl(options.serverUrl);
  return Object.freeze({
    webhooks: Object.freeze(createWebhooks()),
  });
}
