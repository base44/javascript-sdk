import type { WebhookEventMap, WebhookTestV1Data } from "./webhooks.events.generated.js";

export type * from "./webhooks.events.generated.js";

/** Name of a webhook event, e.g. `app.deleted.v1`. */
export type WebhookEventType = keyof WebhookEventMap;

/** CloudEvents 1.0 envelope every Base44 webhook is delivered in. */
export interface CloudEvent<TType extends string, TData> {
  /** CloudEvents version. Always `1.0`. */
  specversion: "1.0";
  /** Unique event id (`evt_…`). Identical across redeliveries, so use it to deduplicate. */
  id: string;
  /** The workspace the event happened in, as a URL. */
  source: string;
  /** Event type, including its version. */
  type: TType;
  /** The resource the event is about, e.g. `apps/<app id>`. */
  subject: string;
  /** When the event occurred (RFC 3339, UTC). */
  time: string;
  /** Content type of `data`. Always `application/json`. */
  datacontenttype: string;
  /** URL of the JSON Schema describing `data`. */
  dataschema: string;
  /** W3C trace context, when the event was produced inside a trace. */
  traceparent?: string;
  /** W3C trace state, when present. */
  tracestate?: string;
  /** Kind of actor that caused the event. */
  authtype: string;
  /** Identifier of the actor that caused the event. */
  authid: string;
  /** Event-specific payload. */
  data: TData;
}

/**
 * A verified Base44 webhook event. Narrow on `type` to read `data`.
 * Base44 may add event types later, so give a `switch` a default branch that still answers 2xx.
 */
export type WebhookEvent = { [K in WebhookEventType]: CloudEvent<K, WebhookEventMap[K]> }[WebhookEventType];

/** Request headers in any common shape: a fetch `Headers`, or a Node-style object. Names are case-insensitive. */
export type WebhookHeaders = Headers | Record<string, string | string[] | undefined>;

/** One Ed25519 public key (`whpk_…`), or several separated by commas or whitespace. */
export type WebhookPublicKeys = string | string[];

/** Webhook settings for `createPlatformServer`. */
export interface WebhooksOptions {
  /** Public keys of your workspace. Pass more than one while a key rotation is in progress. */
  publicKeys?: WebhookPublicKeys;
}

/** Per-call overrides for `verifyEvent`. */
export interface VerifyEventOptions {
  /** Public keys to verify against, instead of the ones the client was created with. */
  publicKeys?: WebhookPublicKeys;
  /** Maximum age or clock skew of a delivery, in seconds. Defaults to 300. */
  toleranceSeconds?: number;
}

/** An event your handler receives: every event except the `webhook.test.v1` probe, which `createHandler` answers itself. */
export type DeliveredWebhookEvent = Exclude<WebhookEvent, CloudEvent<"webhook.test.v1", WebhookTestV1Data>>;

/** Per-type handlers for `createHandler`, each receiving the event already narrowed to its type. */
export type WebhookEventHandlers = {
  [K in DeliveredWebhookEvent["type"]]?: (event: Extract<DeliveredWebhookEvent, { type: K }>) => unknown;
};

/** Options for `createHandler`. Every callback may be async. */
export interface CreateHandlerOptions extends VerifyEventOptions {
  /** Handlers keyed by event type. Types without a handler are still answered 2xx, so Base44 does not retry them. */
  on?: WebhookEventHandlers;
  /** Called for every verified event, before its handler in `on`. */
  onEvent?: (event: DeliveredWebhookEvent) => unknown;
  /**
   * Called once `onEvent` and the event's handler finished without throwing. Return a `Response` to replace the default
   * empty 204.
   */
  onSuccess?: (event: DeliveredWebhookEvent) => Response | void | Promise<Response | void>;
  /**
   * Called when a delivery fails: a `WebhookVerificationError` (default response 400), a
   * `WebhookConfigurationError` (500), or whatever a handler threw (500, so Base44 retries). `event`
   * is set when verification passed and a callback failed. Return a `Response` to replace the default.
   */
  onError?: (error: unknown, event?: DeliveredWebhookEvent) => Response | void | Promise<Response | void>;
}

/** Receive and verify Base44 outbound webhooks. Makes no network requests. */
export interface WebhooksModule {
  /**
   * Verify a delivery and return the event.
   *
   * Pass the body exactly as received, before any JSON parsing. Nothing is parsed until the
   * signature checks out. Rejects with `WebhookVerificationError` for a delivery you should
   * refuse (respond 400) and `WebhookConfigurationError` when the public keys are missing
   * or malformed (let it surface as a 500 so Base44 retries). To activate an endpoint, answer
   * the `webhook.test.v1` event with `{ "challenge": event.data.challenge }`.
   */
  verifyEvent(body: string | Uint8Array, headers: WebhookHeaders, options?: VerifyEventOptions): Promise<WebhookEvent>;

  /**
   * Build a fetch-style route handler (`(request: Request) => Promise<Response>`) for Next.js, Hono,
   * Cloudflare Workers, Deno or Bun. It reads the raw body, verifies it, answers the activation
   * challenge, then runs your callbacks. Delivery is at least once, so handlers must tolerate
   * the same event (same `event.id`) arriving twice.
   */
  createHandler(options?: CreateHandlerOptions): (request: Request) => Promise<Response>;
}
