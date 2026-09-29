import type { PlatformEvent, PlatformEventMap, Snapshot } from "./builder.events.types.js";

export const eventNames = ["update_model", "directive", "queue_update", "task_update", "image_ready"] as const;
/** Error frames that name an app room. */
export const roomErrorCodes = ["access_denied", "access_revoked", "snapshot_unavailable"] as const;
export const appPattern = /^[a-f0-9]{24}$/;
export const roomFor = (appId: string) => `/apps/${appId}`;

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid frame");
  return value as Record<string, unknown>;
}
export function string(value: unknown): string {
  if (typeof value !== "string" || !value) throw new Error("Invalid string");
  return value;
}
export function appFromRoom(value: unknown): string | undefined {
  return typeof value === "string" && /^\/apps\/[a-f0-9]{24}$/.test(value) ? value.slice(6) : undefined;
}
export function decode(type: keyof PlatformEventMap, appId: string, raw: unknown): PlatformEvent {
  const frame = object(raw);
  const wrapped = type === "update_model" || type === "task_update" || type === "image_ready";
  const data = wrapped ? object(JSON.parse(string(frame.data))) : frame;
  // Payload schemas are owned by the service; only decode/validate the transport envelope here.
  return { type, appId, data } as PlatformEvent;
}
export function decodeSnapshot(raw: unknown): Snapshot {
  const frame = object(raw);
  if (!appFromRoom(frame.room) || !Array.isArray(frame.messages) || (frame.status !== null && typeof frame.status !== "object")) {
    throw new Error("Invalid snapshot");
  }
  return frame as unknown as Snapshot;
}
