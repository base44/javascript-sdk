import { WebhookConfigurationError } from "../errors.js";
import type { WebhookHeaders, WebhookPublicKeys } from "./webhooks.types.js";

const SIGNATURE_SCHEME = "v1a";
const encoder = new TextEncoder();

/** Standard base64 to bytes, or `null` when it is not valid base64. */
function decodeBase64(value: string): Uint8Array | null {
  try {
    const binary = atob(value);
    return Uint8Array.from(binary, char => char.charCodeAt(0));
  } catch {
    return null;
  }
}

/** Split the configured keys into raw 32-byte Ed25519 keys. A truncated paste throws: a wrong key reads as every event being forged. */
export function parsePublicKeys(keys: WebhookPublicKeys | undefined): Uint8Array[] {
  const entries = (Array.isArray(keys) ? keys : (keys ?? "").split(/[\s,]+/)).map(key => key.trim()).filter(Boolean);
  if (entries.length === 0) throw new WebhookConfigurationError("missing_public_keys", "no public keys were provided");
  return entries.map(entry => {
    const raw = decodeBase64(entry.replace(/^whpk_/, ""));
    if (!raw || raw.length !== 32) {
      throw new WebhookConfigurationError("invalid_public_key", "a public key is not a base64-encoded 32-byte Ed25519 key");
    }
    return raw;
  });
}

export function importPublicKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", raw as BufferSource, "Ed25519", false, ["verify"]);
}

/** Read one header from a `Headers` or a Node-style object. */
export function readHeader(headers: WebhookHeaders, name: string, separator = ", "): string | null {
  if (typeof (headers as Headers).get === "function") return (headers as Headers).get(name);
  for (const [key, value] of Object.entries(headers as Record<string, string | string[] | undefined>)) {
    if (key.toLowerCase() === name && value !== undefined) return Array.isArray(value) ? value.join(separator) : value;
  }
  return null;
}

/** The `v1a,<base64>` entries of a `webhook-signature` header, decoded. */
export function parseSignatures(header: string): Uint8Array[] {
  return header
    .split(" ")
    .filter(entry => entry.startsWith(`${SIGNATURE_SCHEME},`))
    .map(entry => decodeBase64(entry.slice(SIGNATURE_SCHEME.length + 1)))
    .filter((signature): signature is Uint8Array => signature !== null);
}

/** The signed bytes: `<id>.<timestamp>.<raw body>`. */
export function signedPayload(id: string, timestamp: string, body: string | Uint8Array): Uint8Array {
  const prefix = encoder.encode(`${id}.${timestamp}.`);
  const bytes = typeof body === "string" ? encoder.encode(body) : body;
  const payload = new Uint8Array(prefix.length + bytes.length);
  payload.set(prefix);
  payload.set(bytes, prefix.length);
  return payload;
}

export async function anySignatureVerifies(keys: CryptoKey[], signatures: Uint8Array[], payload: Uint8Array): Promise<boolean> {
  for (const key of keys) {
    for (const signature of signatures) {
      if (await crypto.subtle.verify("Ed25519", key, signature as BufferSource, payload as BufferSource)) return true;
    }
  }
  return false;
}
