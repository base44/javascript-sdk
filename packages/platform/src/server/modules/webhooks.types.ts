import type { WebhookEventMap } from "./webhooks.events.generated.js";

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

/** JSON body to return from your endpoint to activate it. */
export interface WebhookChallengeResponse {
  /** The challenge from the activation probe. */
  challenge: string;
}

/** Receive and verify Base44 outbound webhooks. Makes no network requests. */
export interface WebhooksModule {
  /**
   * Verify a delivery and return the event.
   *
   * Pass the body exactly as received, before any JSON parsing. Nothing is parsed until the
   * signature checks out. Rejects with {@link WebhookVerificationError} for a delivery you should
   * refuse (respond 400) and {@link WebhookConfigurationError} when the public keys are missing
   * or malformed (let it surface as a 500 so Base44 retries).
   */
  verifyEvent(body: string | Uint8Array, headers: WebhookHeaders, options?: VerifyEventOptions): Promise<WebhookEvent>;

  /**
   * Answer the activation probe. Returns the JSON body to respond with when `event` is the
   * `webhook.test.v1` probe, and `undefined` for every other event.
   */
  handleChallenge(event: WebhookEvent): WebhookChallengeResponse | undefined;
}
