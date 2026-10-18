import type { ChatModule } from "./modules/chat.types.js";

/**
 * The platform client.
 *
 * Provides access to the platform's modules.
 */
export interface PlatformClient {
  /** [Chat module](/developers/references/platform-sdk/docs/interfaces/chat) for following the AI chat in your users' apps live. */
  readonly chat: ChatModule;
  /**
   * @deprecated Renamed to {@linkcode chat}, the same module. Removed in 1.0.
   * @hidden
   */
  readonly builder: ChatModule;
}
