import type { PlatformClientOptions } from "./client.types.js";
import { createBuilder } from "./modules/builder.js";
import type { BuilderModule } from "./modules/builder.types.js";

/**
 * Browser client for the Base44 platform.
 *
 * Use it in a white-label app editor to follow what the AI chat does in your users' apps. Creating
 * the client opens no sockets, starts no timers and sends no requests. Each module sets up its own
 * resources when you initialize it.
 *
 * @example
 * ```typescript
 * // Create a client
 * import { Base44PlatformClient } from '@base44/platform';
 *
 * const client = new Base44PlatformClient({
 *   serverUrl: socketUrl,
 *   async getSessionToken() {
 *     const response = await fetch('/api/builder-socket-session', { method: 'POST' });
 *     const { session_token } = await response.json();
 *     return session_token;
 *   },
 * });
 * const builder = client.builder.init({ onError: (error) => console.error(error.code) });
 * ```
 */
export class Base44PlatformClient {
  /**
   * [Builder module](/developers/references/platform-sdk/docs/interfaces/builder) for following the AI chat in your users' apps live.
   * Call [`init()`](/developers/references/platform-sdk/docs/interfaces/builder#init) to create a session.
   */
  readonly builder: BuilderModule;

  /**
   * Creates a platform client.
   *
   * @param options - Client options.
   * @throws {TypeError} When `serverUrl` isn't an HTTP or HTTPS origin.
   */
  constructor(options: PlatformClientOptions) {
    const url = new URL(options.serverUrl);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
      throw new TypeError("serverUrl must be an HTTP(S) origin without credentials, path, query or fragment");
    }
    this.builder = Object.freeze(createBuilder({ ...options, serverUrl: url.origin }));
  }
}
