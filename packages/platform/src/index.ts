/** Browser platform modules, separate from the runtime and server SDKs. */
export { Base44PlatformClient } from "./client.js";
export { PlatformSocketError } from "./errors.js";
export type { PlatformSocketErrorCode } from "./errors.types.js";
export type { PlatformClientOptions } from "./client.types.js";
export type { BuilderModule, BuilderInitOptions, BuilderSession, PlatformSubscription, SubscriptionOptions } from "./modules/builder.types.js";
export type { GuardApproval, PlatformEvent, PlatformEventMap, PlatformSnapshot, ToolCall } from "./modules/builder.events.types.js";
export type * from "./modules/builder.events.generated.js";
