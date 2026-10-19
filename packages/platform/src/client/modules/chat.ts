import { ChatSocket } from "./chat-socket.js";
import type { ChatModule } from "./chat.types.js";

/** @internal */
export function createChat(): ChatModule {
  return {
    init(options) { return new ChatSocket(options); },
  };
}
