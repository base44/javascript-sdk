import { createWebhooks } from "./modules/webhooks.js";
import type { PlatformServer } from "./server.types.js";

/**
 * Creates a platform server client.
 *
 * This is the entry point of the Platform SDK on your backend. Import it from
 * `@base44/platform/server`. The client gives your server access to the platform's server modules,
 * such as [`webhooks`](/developers/references/platform-sdk/docs/interfaces/webhooks). It takes no
 * options and makes no network requests. Each module takes what it needs when you call it.
 *
 * @returns A new platform server client.
 *
 * @example
 * ```typescript
 * // Create a server client on your backend
 * import { createPlatformServer } from '@base44/platform/server';
 *
 * const platform = createPlatformServer();
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
export function createPlatformServer(): PlatformServer {
  return Object.freeze({
    webhooks: Object.freeze(createWebhooks()),
  });
}
