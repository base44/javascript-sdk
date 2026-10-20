import type { PlatformClient } from "./client.types.js";
import { createChat } from "./modules/chat.js";

/**
 * Creates a platform client.
 *
 * This is the entry point of the Platform SDK. The client gives your white-label app editor
 * access to the platform's modules, such as [`chat`](/developers/references/platform-sdk/docs/interfaces/chat).
 * It takes no options and opens nothing: each chat session gets its socket session from the
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
 * const chat = client.chat.init({
 *   async getSession() {
 *     const response = await fetch('/api/chat-socket-session', { method: 'POST' });
 *     return response.json();
 *   },
 *   onError: (error) => console.error(error.code),
 * });
 * await chat.connect();
 * ```
 */
export function createPlatformClient(): PlatformClient {
  return Object.freeze({ chat: Object.freeze(createChat()) });
}
