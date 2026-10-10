import type { PlatformClient, PlatformClientOptions } from "./client.types.js";
import { createBuilder } from "./modules/builder.js";

/**
 * Creates a platform client.
 *
 * This is the entry point of the Platform SDK. The client gives your white-label app editor
 * access to the platform's modules, such as [`builder`](/developers/references/platform-sdk/docs/interfaces/builder).
 *
 * @param options - Configuration object for the client.
 * @returns A configured platform client with access to the platform's modules.
 * @throws {TypeError} When `socketUrl` isn't an HTTP or HTTPS origin.
 *
 * @example
 * ```typescript
 * // Create a client for your app editor
 * import { createPlatformClient } from '@base44/platform';
 *
 * const client = createPlatformClient({
 *   socketUrl,
 *   async getSessionToken() {
 *     const response = await fetch('/api/builder-socket-session', { method: 'POST' });
 *     const { session_token } = await response.json();
 *     return session_token;
 *   },
 * });
 *
 * // Use the client to follow the AI chat in an app
 * const builder = client.builder.init({ onError: (error) => console.error(error.code) });
 * await builder.connect();
 * ```
 */
export function createPlatformClient(options: PlatformClientOptions): PlatformClient {
  const url = new URL(options.socketUrl);
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new TypeError("socketUrl must be an HTTP(S) origin without credentials, path, query or fragment");
  }
  return Object.freeze({ builder: Object.freeze(createBuilder({ ...options, socketUrl: url.origin })) });
}
