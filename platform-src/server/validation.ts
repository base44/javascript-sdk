import { Base44PlatformError } from "./errors.js";

export function invalid(message: string): never {
  throw new Base44PlatformError("invalid_argument", message);
}
export function identifier(value: string): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) invalid("Expected a nonempty resource ID containing letters, digits, underscores or hyphens.");
  return encodeURIComponent(value);
}
export function externalId(value: string): string {
  if (typeof value !== "string" || !value.trim() || value.trim() === "." || value.trim() === "..") invalid("Expected a nonempty external user ID, excluding dot path segments.");
  return value.trim().toLowerCase();
}
export function positive(value: number): number {
  if (!Number.isFinite(value) || value <= 0) invalid("Expected a positive finite number.");
  return value;
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return badResponse();
  return value as Record<string, unknown>;
}
export function badResponse(): never {
  throw new Base44PlatformError("invalid_response", "The platform returned an unexpected response shape.");
}
export function requiredString(value: unknown): string {
  return typeof value === "string" && value.length > 0 ? value : badResponse();
}
export function nullableString(value: unknown): string | null {
  return value == null ? null : typeof value === "string" ? value : badResponse();
}
export function boolean(value: unknown): boolean {
  return typeof value === "boolean" ? value : badResponse();
}
