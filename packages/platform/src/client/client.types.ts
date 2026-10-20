import type { ChatModule } from "./modules/chat.types.js";

/**
 * The platform client, with one property for each module.
 */
export interface PlatformClient {
  /** [Chat module](/developers/references/platform-sdk/docs/interfaces/chat) for following the AI chat of your users' apps. */
  readonly chat: ChatModule;
}
