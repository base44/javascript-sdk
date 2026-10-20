/** Browser platform modules, separate from the runtime and server SDKs. */
export { createPlatformClient } from "./client.js";
export { PlatformSocketError } from "./errors.js";
export type { AppErrorCode, PlatformSocketErrorCode, SessionErrorCode } from "./errors.types.js";
export type { PlatformClient } from "./client.types.js";
export type { ChatModule, ChatInitOptions, ChatSession, PlatformSubscription, SocketSession, SubscriptionOptions } from "./modules/chat.types.js";
export type { AppEvent, GuardApproval, PlatformEvent, PlatformEventMap, PlatformSnapshot, ToolCall, UnknownEvent } from "./modules/chat.events.types.js";
export type * from "./modules/chat.events.generated.js";
