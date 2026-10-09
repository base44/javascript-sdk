import type { Message, ServerEventMap, Snapshot } from "./builder.events.generated.js";

/**
 * Maps each live event name to the type of its `data` payload.
 *
 * Generated from the service's AsyncAPI document, so it covers every app event the service sends.
 * The client handles the session events `app.snapshot`, `session.ended` and `room.*` itself, and
 * reports them through `onSnapshot` and `onError` instead.
 */
export type PlatformEventMap = {
  [K in keyof ServerEventMap as K extends "app.snapshot" | "session.ended" | `room.${string}` ? never : K]: ServerEventMap[K];
};

/**
 * One live event for a subscribed app.
 *
 * Check `type` to narrow `data` to that event's payload. A key missing from `data` means the value
 * is unchanged, and an explicit `null` clears it. For every event and its payload, see the
 * [events reference](/developers/references/platform-sdk/live-updates/events).
 *
 * @example
 * ```typescript
 * // Narrow an event by type
 * function onEvent(event: PlatformEvent) {
 *   if (event.type === "message.updated") {
 *     const { message } = event.data;
 *     console.log(`Message ${message.id} changed`);
 *   }
 * }
 * ```
 */
export type PlatformEvent = {
  [K in keyof PlatformEventMap]: {
    /** Event name. Narrows the type of `data`. */
    type: K;
    /** ID of the app the event belongs to. */
    appId: string;
    /** Event payload. */
    data: PlatformEventMap[K];
  };
}[keyof PlatformEventMap];

/**
 * An app's current state.
 *
 * Arrives after every join and rejoin, and after a rewrite of the main conversation. Replace
 * everything you hold for the app with it. It holds only the last 50 messages.
 */
export interface PlatformSnapshot extends Snapshot {
  /** The app's room, `/apps/{app_id}`. */
  room: string;
}

/** One tool call in a message's `tool_calls`. Check `name` to narrow it to that tool's call. */
export type ToolCall = NonNullable<Message["tool_calls"]>[number];

/** Why a safety guard parked a tool call for approval. Check `guard` to narrow it. */
export type GuardApproval = NonNullable<ToolCall["approval"]>;
