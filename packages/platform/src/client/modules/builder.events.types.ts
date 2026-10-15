import type { Message, QueueState, ServerEventMap, Snapshot } from "./builder.events.generated.js";

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
 * is unchanged, and an explicit `null` clears it. For every event and its payload, see
 * [Socket messages](/developers/references/apps-api/sections/socket-messages).
 *
 * An event added to the service after this version of the SDK arrives with `type: "unknown"`, its
 * name in `name` and an unchecked `data`, so check a field before using it. After you upgrade, it
 * arrives under its own `type`.
 *
 * @example
 * ```typescript
 * // Narrow an event by type
 * function onEvent(event: PlatformEvent) {
 *   if (event.type === "message.updated") {
 *     const { message } = event.data;
 *     console.log(`Message ${message.id} changed`);
 *   }
 *   if (event.type === "unknown" && event.name === "app.renamed" && typeof event.data.name === "string") {
 *     console.log(`App renamed to ${event.data.name}`);
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
}[keyof PlatformEventMap] | {
  /** An event this version of the SDK doesn't know. */
  type: "unknown";
  /** The event's name on the socket. */
  name: string;
  /** ID of the app the event belongs to. */
  appId: string;
  /** Event payload, not checked by the SDK. */
  data: Record<string, unknown>;
};

/**
 * An app's current state.
 *
 * Arrives after every join and rejoin, and after a rewrite of the main conversation. Replace
 * everything you hold for the app with it. It holds only the last 50 messages.
 *
 * Its fields are the `data` of [`app.snapshot`](/developers/references/apps-api/sections/socket-messages#app-snapshot),
 * plus `room`.
 */
export interface PlatformSnapshot extends Omit<Snapshot, "queue"> {
  /** The app's room, `/apps/{app_id}`. */
  room: string;
  /** The main branch's prompt queue. Missing when the server sends none. */
  queue?: QueueState;
}

/**
 * One tool call in a message's `tool_calls`. Checking `name` narrows it to that tool's call and
 * `OtherToolCall`, which covers tools the SDK doesn't know, so check a field with `in` before using it.
 */
export type ToolCall = NonNullable<Message["tool_calls"]>[number];

/** Why a safety guard parked a tool call for approval. Check `guard` to narrow it. */
export type GuardApproval = NonNullable<ToolCall["approval"]>;
