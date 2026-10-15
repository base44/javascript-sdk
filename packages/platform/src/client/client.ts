import type { PlatformClient } from "./client.types.js";
import { createBuilder } from "./modules/builder.js";

/**
 * Creates a platform client.
 *
 * This is the entry point of the Platform SDK. The client gives your white-label app editor
 * access to the platform's modules, such as [`builder`](/developers/references/platform-sdk/docs/interfaces/builder).
 * It takes no options and opens nothing: each builder session gets its socket session from the
 * `getSession` you pass to `init()`.
 *
 * @returns A platform client with access to the platform's modules.
 *
 * @example
 * ```typescript
 * // Create a client for your app editor
 * import { createPlatformClient } from '@base44/platform';
 *
 * const client = createPlatformClient();
 *
 * // Use the client to follow the AI chat in an app
 * const builder = client.builder.init({
 *   async getSession() {
 *     const response = await fetch('/api/builder-socket-session', { method: 'POST' });
 *     return response.json();
 *   },
 *   onError: (error) => console.error(error.code),
 * });
 * await builder.connect();
 * ```
 */
export function createPlatformClient(): PlatformClient {
  return Object.freeze({ builder: Object.freeze(createBuilder()) });
}
