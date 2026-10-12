import { WebhookVerificationError } from "../errors.js";
import { anySignatureVerifies, importPublicKey, parsePublicKeys, parseSignatures, readHeader, signedPayload } from "./webhooks-signature.js";
import type { WebhookEvent, WebhooksModule, WebhooksOptions } from "./webhooks.types.js";

const DEFAULT_TOLERANCE_SECONDS = 300;

/** Webhook receiving utilities. Verification is local: no network calls, no timers. */
export function createWebhooks(options: WebhooksOptions = {}): WebhooksModule {
  // Imported keys are cached by their wire form so a pinned key is imported once.
  const imported = new Map<string, Promise<CryptoKey>>();
  const keysFor = (publicKeys = options.publicKeys) =>
    Promise.all(parsePublicKeys(publicKeys).map(raw => {
      const id = raw.join(",");
      if (!imported.has(id)) imported.set(id, importPublicKey(raw));
      return imported.get(id)!;
    }));

  return {
    async verifyEvent(body, headers, verifyOptions = {}) {
      // Configuration problems surface first, whatever the request looks like: a missing key is ours to fix.
      const keys = await keysFor(verifyOptions.publicKeys);

      const id = readHeader(headers, "webhook-id");
      const timestamp = readHeader(headers, "webhook-timestamp");
      const signature = readHeader(headers, "webhook-signature", " ");
      if (!id || !timestamp || !signature) throw new WebhookVerificationError("missing_headers");
      // Negated so a non-numeric timestamp (NaN) is refused too.
      if (!(Math.abs(Date.now() / 1000 - Number(timestamp)) <= (verifyOptions.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS))) {
        throw new WebhookVerificationError("timestamp_outside_tolerance");
      }
      const signatures = parseSignatures(signature);
      if (signatures.length === 0) throw new WebhookVerificationError("no_signature_entries");
      if (!(await anySignatureVerifies(keys, signatures, signedPayload(id, timestamp, body)))) {
        throw new WebhookVerificationError("signature_mismatch");
      }

      // Only now is the body trusted enough to parse.
      let event: unknown;
      try {
        event = JSON.parse(typeof body === "string" ? body : new TextDecoder().decode(body));
      } catch {
        throw new WebhookVerificationError("invalid_payload");
      }
      const { type, id: eventId, data } = (event ?? {}) as Record<string, unknown>;
      if (typeof type !== "string" || typeof eventId !== "string" || typeof data !== "object" || data === null) {
        throw new WebhookVerificationError("invalid_payload");
      }
      return event as WebhookEvent;
    },

    handleChallenge(event) {
      return event.type === "webhook.test.v1" ? { challenge: event.data.challenge } : undefined;
    },
  };
}
