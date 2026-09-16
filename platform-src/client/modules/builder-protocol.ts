import type { Joined, PlatformEvent, PlatformEventMap } from "./builder.events.types.js";

export const eventNames = ["update_model", "directive", "queue_update", "task_update", "image_ready"] as const;
export const errorCodes = ["invalid_room", "invalid_cursor", "access_denied", "subscription_limit", "resync_required", "stream_unavailable"] as const;
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
export function eventApp(type: keyof PlatformEventMap, raw: unknown): string | undefined {
  const frame = object(raw);
  return type === "queue_update"
    ? typeof frame.app_id === "string" && appPattern.test(frame.app_id) ? frame.app_id : undefined
    : appFromRoom(frame.room);
}
export function decode(type: keyof PlatformEventMap, appId: string, raw: unknown): PlatformEvent {
  const frame = object(raw);
  const seq = string(frame.seq);
  const wrapped = type === "update_model" || type === "task_update" || type === "image_ready";
  const { seq: _, ...flat } = frame;
  const data = wrapped ? object(JSON.parse(string(frame.data))) : flat;
  // Payload schemas are owned by the service; only decode/validate the transport envelope here.
  return { type, appId, seq, data } as PlatformEvent;
}
export function decodeJoined(raw: unknown): Joined {
  const frame = object(raw);
  if (!appFromRoom(frame.room) || !Number.isInteger(frame.max_entries) || !Number.isInteger(frame.inactivity_expiry_seconds)) throw new Error("Invalid boundary");
  string(frame.seq);
  return frame as unknown as Joined;
}
