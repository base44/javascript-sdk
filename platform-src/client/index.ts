/** Read-only browser platform subscriptions, separate from the runtime and server SDKs. */
export { Base44PlatformClient } from "./client.js";
export { PlatformSocketError } from "./errors.js";
export type { PlatformSocketErrorCode } from "./errors.js";
export type { PlatformClientOptions, PlatformSubscription, SubscriptionOptions } from "./types.js";
export type { AppUpdate, ChatMessage, ToolCall, QueueItem, QueueUpdate, TaskUpdate, ImageReady, Directive, PlatformEventMap, PlatformEvent, Joined } from "./events.js";
