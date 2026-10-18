import { WebhookConfigurationError, WebhookVerificationError } from "../errors.js";
import { anySignatureVerifies, importPublicKey, parsePublicKeys, parseSignatures, readHeader, signedPayload } from "./webhooks-signature.js";
import { WEBHOOK_EVENT_TYPES } from "./webhooks.events.generated.js";
import type { DeliveredWebhookEvent, WebhookEvent, WebhookPublicKeys, WebhooksModule } from "./webhooks.types.js";

const knownTypes: ReadonlySet<string> = new Set(WEBHOOK_EVENT_TYPES);

const DEFAULT_TOLERANCE_SECONDS = 300;

/** Webhook receiving utilities. Verification is local: no network calls, no timers. */
export function createWebhooks(): WebhooksModule {
  // Imported keys are cached by their wire form so a pinned key is imported once.
  const imported = new Map<string, Promise<CryptoKey>>();
  const keysFor = (publicKeys: WebhookPublicKeys | undefined) =>
    Promise.all(parsePublicKeys(publicKeys).map(raw => {
      const id = raw.join(",");
      if (!imported.has(id)) {
        imported.set(id, importPublicKey(raw).catch(() => {
          // Evicted so a later call retries the import instead of replaying this failure.
          imported.delete(id);
          throw new WebhookConfigurationError("unsupported_runtime", "this runtime can't import Ed25519 keys with WebCrypto");
        }));
      }
      return imported.get(id)!;
    }));

  const verifyEvent: WebhooksModule["verifyEvent"] = async (body, headers, verifyOptions) => {
    // Configuration problems surface first, whatever the request looks like: a missing key is ours to fix.
    const keys = await keysFor(verifyOptions?.publicKeys);

    const id = readHeader(headers, "webhook-id");
    const timestamp = readHeader(headers, "webhook-timestamp");
    const signature = readHeader(headers, "webhook-signature", " ");
    if (!id || !timestamp || !signature) throw new WebhookVerificationError("missing_headers");
    // Negated so a non-numeric timestamp (NaN) is refused too.
    if (!(Math.abs(Date.now() / 1000 - Number(timestamp)) <= (verifyOptions?.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS))) {
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
    // A type from a newer Base44 gets the client's unknown-event shape, so known types keep narrowing.
    return (knownTypes.has(type) ? event : { ...(event as object), type: "unknown", name: type }) as WebhookEvent;
  };

  return {
    verifyEvent,

    createHandler({ on = {}, onEvent, onSuccess, onError, ...verifyOptions }) {
      const fail = async (error: unknown, status: number, label: string, event?: DeliveredWebhookEvent) =>
        (await onError?.(error, event)) ?? Response.json({ error: label }, { status });

      return async request => {
        let body: Uint8Array;
        try {
          body = new Uint8Array(await request.arrayBuffer());
        } catch (error) {
          return fail(error, 500, "request_failed");
        }
        let event: WebhookEvent;
        try {
          event = await verifyEvent(body, request.headers, verifyOptions);
        } catch (error) {
          if (error instanceof WebhookVerificationError) return fail(error, 400, error.code);
          return fail(error, 500, error instanceof WebhookConfigurationError ? "receiver_misconfigured" : "request_failed");
        }
        // Activation probe: echo the challenge, only after the signature verified. Never reaches your callbacks.
        if (event.type === "webhook.test.v1") return Response.json({ challenge: event.data.challenge });

        try {
          await onEvent?.(event);
          await (on[event.type] as ((event: DeliveredWebhookEvent) => unknown) | undefined)?.(event);
          return (await onSuccess?.(event)) ?? new Response(null, { status: 204 });
        } catch (error) {
          return fail(error, 500, "handler_failed", event);
        }
      };
    },
  };
}
