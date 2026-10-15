/** Browser platform modules, separate from the runtime and server SDKs. */
export { createPlatformClient } from "./client.js";
export { PlatformSocketError } from "./errors.js";
export type { AppErrorCode, PlatformSocketErrorCode, SessionErrorCode } from "./errors.types.js";
export type { PlatformClient } from "./client.types.js";
export type { BuilderModule, BuilderInitOptions, BuilderSession, PlatformSubscription, SocketSession, SubscriptionOptions } from "./modules/builder.types.js";
export type { GuardApproval, PlatformEvent, PlatformEventMap, PlatformSnapshot, ToolCall } from "./modules/builder.events.types.js";
export type * from "./modules/builder.events.generated.js";
