import type { PlatformClient } from "./client.types.js";
import { createChat } from "./modules/chat.js";

/**
 * Creates a platform client.
 *
 * This is the entry point of the Platform SDK in the browser. Import it from `@base44/platform`.
 * The client gives your white-label app editor access to the platform's modules, such as
 * [`chat`](/developers/references/platform-sdk/docs/interfaces/chat). It takes no options and
 * doesn't connect to anything. Each call to
 * [`client.chat.init()`](/developers/references/platform-sdk/docs/interfaces/chat#init) gets a
 * socket session from the `getSession()` function you pass in. On your backend, use
 * [`createPlatformServer()`](/developers/references/platform-sdk/docs/functions/createPlatformServer)
 * from `@base44/platform/server`.
 *
 * @returns A new platform client.
 *
 * @example
 * ```typescript
 * // Create a client for your app editor
 * import { createPlatformClient } from '@base44/platform';
 *
 * const client = createPlatformClient();
 *
 * // Use the client to follow the AI chat in an app
 * const chat = client.chat.init({
 *   async getSession() {
 *     const response = await fetch('/api/chat-socket-session', { method: 'POST' });
 *     return response.json();
 *   },
 *   onError: (error) => console.error('Live updates error', error.code),
 * });
 * await chat.connect();
 * ```
 */
export function createPlatformClient(): PlatformClient {
  return Object.freeze({ chat: Object.freeze(createChat()) });
}
