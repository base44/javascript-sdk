import type { PlatformEvent, PlatformEventMap, Snapshot } from "./builder.events.types.js";

export const eventNames = [
  "message.updated", "message.removed", "app.status_changed", "preview.reload_requested",
  "preview.navigation_requested", "queue.updated", "task.progressed", "image.resolved",
  "conversation.changed", "files.changed", "branch.deleted", "repository.changed", "pull_request.changed",
] as const satisfies readonly (keyof PlatformEventMap)[];
/** Notices that name an app room, by the error code each one reports. */
export const roomNotices = {
  "room.access_denied": "access_denied",
  "room.access_revoked": "access_revoked",
  "room.snapshot_unavailable": "snapshot_unavailable",
} as const;
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
export function decodeSnapshot(raw: unknown): Snapshot {
  const frame = object(raw);
  const data = object(frame.data);
  if (!appFromRoom(frame.room) || !Array.isArray(data.messages) || (data.status !== null && typeof data.status !== "object")) {
    throw new Error("Invalid snapshot");
  }
  const queue = data.queue !== null && typeof data.queue === "object" ? { queue: data.queue } : {};
  return { room: frame.room, status: data.status, messages: data.messages, ...queue } as Snapshot;
}
