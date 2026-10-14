import { serverEventNames, type ServerEventMap, type SessionEnded } from "./builder.events.generated.js";
import type { PlatformSocketErrorCode } from "../errors.types.js";
import type { PlatformEvent, PlatformEventMap, PlatformSnapshot } from "./builder.events.types.js";

const sessionEvents: readonly string[] = ["app.snapshot", "session.ended"];
/** App events delivered to `onEvent`: every server event except the session events the socket handles. */
export const eventNames = serverEventNames.filter(
  (name): name is keyof PlatformEventMap & typeof name => !sessionEvents.includes(name) && !name.startsWith("room."),
);
/** Notices that name an app room, by the error code each one reports. A new notice fails to compile until it has one. */
export const roomNotices = {
  "room.access_denied": "access_denied",
  "room.access_revoked": "access_revoked",
  "room.snapshot_unavailable": "snapshot_unavailable",
} as const satisfies Record<Extract<keyof ServerEventMap, `room.${string}`>, PlatformSocketErrorCode>;
// `expired` never reaches the partner: the session renews its token.
export const sessionEndings = {
  expired: "session_expired",
  revoked: "session_revoked",
  replaced: "session_replaced",
} as const satisfies Record<SessionEnded["reason"], PlatformSocketErrorCode | "session_expired">;
export const appPattern = /^[a-f0-9]{24}$/;
export const roomFor = (appId: string) => `/apps/${appId}`;

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid frame");
  return value as Record<string, unknown>;
}
export function appFromRoom(value: unknown): string | undefined {
  return typeof value === "string" && /^\/apps\/[a-f0-9]{24}$/.test(value) ? value.slice(6) : undefined;
}
/** Every event is `{room, data}`; payload schemas are the service's, so only the envelope is validated. */
export function decode(type: keyof PlatformEventMap, appId: string, raw: unknown): PlatformEvent {
  return { type, appId, data: object(object(raw).data) } as PlatformEvent;
}
export function decodeSnapshot(raw: unknown): PlatformSnapshot {
  const frame = object(raw);
  const data = object(frame.data);
  if (!appFromRoom(frame.room) || !Array.isArray(data.messages) || (data.status !== null && typeof data.status !== "object")) {
    throw new Error("Invalid snapshot");
  }
  const queue = data.queue !== null && typeof data.queue === "object" ? { queue: data.queue } : {};
  return { room: frame.room, status: data.status, messages: data.messages, ...queue } as PlatformSnapshot;
}
