import type { WebhookEventMap, WebhookTestV1Data } from "./webhooks.events.generated.js";

export type * from "./webhooks.events.generated.js";

/** Name of a webhook event, such as `app.deleted.v1`. The version is part of the name. */
export type WebhookEventType = keyof WebhookEventMap;

/** The CloudEvents 1.0 envelope every webhook arrives in. Its `data` depends on `type`. */
export interface CloudEvent<TType extends string, TData> {
  /** CloudEvents version. Always `1.0`. */
  specversion: "1.0";
  /** Unique event ID, starting with `evt_`. A redelivery keeps the same ID, so use it to skip events you already handled. */
  id: string;
  /** URL of the workspace the event happened in. */
  source: string;
  /** Event type, including its version. */
  type: TType;
  /** The resource the event is about, such as `apps/<app ID>`. */
  subject: string;
  /** When the event happened, as an RFC 3339 timestamp in UTC. */
  time: string;
  /** Content type of `data`. Always `application/json`. */
  datacontenttype: string;
  /** URL of the JSON Schema that describes `data`. */
  dataschema: string;
  /** W3C trace context, when the event was produced inside a trace. */
  traceparent?: string;
  /** W3C trace state, when the event was produced inside a trace. */
  tracestate?: string;
  /** Kind of actor that caused the event. */
  authtype: string;
  /** ID of the actor that caused the event. */
  authid: string;
  /** The event's payload. Its shape depends on `type`. */
  data: TData;
}

/**
 * A verified webhook event.
 *
 * Check `type` to narrow `data` to that event's payload. Base44 can add event types later, so give a
 * `switch` a default branch that still answers 2xx. A non-2xx answer makes Base44 retry the delivery.
 */
export type WebhookEvent = { [K in WebhookEventType]: CloudEvent<K, WebhookEventMap[K]> }[WebhookEventType];

/** Request headers, as a fetch `Headers` object or a Node.js-style object. Header names are case-insensitive. */
export type WebhookHeaders = Headers | Record<string, string | string[] | undefined>;

/** One Ed25519 public key, starting with `whpk_`, or several in an array or separated by commas or whitespace. */
export type WebhookPublicKeys = string | string[];

/** Options for {@linkcode WebhooksModule.verifyEvent | verifyEvent()}. */
export interface VerifyEventOptions {
  /**
   * Your workspace's public keys.
   *
   * Pass both the old and the new key while a key rotation is in progress. Missing or malformed keys
   * reject with `WebhookConfigurationError`.
   */
  publicKeys: WebhookPublicKeys;
  /** How far, in seconds, a delivery's timestamp can be from your server's clock. Defaults to `300`. */
  toleranceSeconds?: number;
}

/** An event your callbacks receive. Every event except the `webhook.test.v1` activation probe, which the handler answers itself. */
export type DeliveredWebhookEvent = Exclude<WebhookEvent, CloudEvent<"webhook.test.v1", WebhookTestV1Data>>;

/** Handlers keyed by event type. Each handler receives the event narrowed to its type. */
export type WebhookEventHandlers = {
  [K in DeliveredWebhookEvent["type"]]?: (event: Extract<DeliveredWebhookEvent, { type: K }>) => unknown;
};

/** Options for {@linkcode WebhooksModule.createHandler | createHandler()}. Every callback can be async. */
export interface CreateHandlerOptions extends VerifyEventOptions {
  /** Handlers keyed by event type. Events without a handler are still answered 2xx, so Base44 doesn't retry them. */
  on?: WebhookEventHandlers;
  /** Called for every verified event, before its handler in `on`. */
  onEvent?: (event: DeliveredWebhookEvent) => unknown;
  /**
   * Called after `onEvent` and the event's handler finish without throwing.
   *
   * Return a `Response` to replace the default empty 204.
   */
  onSuccess?: (event: DeliveredWebhookEvent) => Response | void | Promise<Response | void>;
  /**
   * Called when a delivery fails.
   *
   * The handler answers a `WebhookVerificationError` with a 400. It answers a `WebhookConfigurationError`,
   * or anything a callback throws, with a 500 so Base44 retries. The `event` argument is set when the
   * delivery verified and a callback failed. Return a `Response` to replace the default answer.
   */
  onError?: (error: unknown, event?: DeliveredWebhookEvent) => Response | void | Promise<Response | void>;
}

/**
 * Webhooks module for receiving the events Base44 sends to your server.
 *
 * Base44 sends a signed event to your endpoint when something happens in your workspace:
 * - An app is created, published, unpublished, moved to trash or restored.
 * - Base44 tests a new endpoint before activating it.
 *
 * The module verifies each delivery's signature with your workspace's public keys, and gives you
 * the event with its payload typed. It runs on Node.js 20 and later and on edge runtimes, and makes
 * no network requests.
 *
 * Use {@linkcode createHandler | createHandler()} for a ready-made route handler, or
 * {@linkcode verifyEvent | verifyEvent()} to handle the request yourself. Base44 delivers each event at
 * least once and in no guaranteed order, so skip events whose `id` you already handled.
 */
export interface WebhooksModule {
  /**
   * Verifies a delivery and returns its event.
   *
   * Pass the request body exactly as received, before any JSON parsing, because the signature covers
   * its exact bytes. Nothing is parsed until the signature checks out.
   *
   * To activate a new endpoint, answer the `webhook.test.v1` event with
   * `{ "challenge": event.data.challenge }` within 5 seconds. Answer every other event with a 2xx.
   *
   * @param body - The raw request body, as text or bytes.
   * @param headers - The request headers.
   * @param options - Verification options, including your public keys.
   * @returns Promise resolving to the verified event.
   * @throws {WebhookVerificationError} When the delivery can't be trusted. Answer with a 400.
   * @throws {WebhookConfigurationError} When the public keys are missing or malformed. Let it surface as a 500.
   *
   * @example
   * ```typescript
   * // Verify the request and handle each event type
   * export async function POST(request) {
   *   const rawBody = await request.text();
   *   let event;
   *   try {
   *     event = await platform.webhooks.verifyEvent(rawBody, request.headers, {
   *       publicKeys: process.env.BASE44_WEBHOOK_PUBLIC_KEYS,
   *     });
   *   } catch (error) {
   *     if (error instanceof WebhookVerificationError) return new Response(null, { status: 400 });
   *     throw error;
   *   }
   *
   *   switch (event.type) {
   *     case 'webhook.test.v1':
   *       return Response.json({ challenge: event.data.challenge });
   *     case 'app.deleted.v1':
   *       await removeApp(event.data.app_id);
   *       break;
   *   }
   *   return new Response(null, { status: 204 });
   * }
   * ```
   */
  verifyEvent(body: string | Uint8Array, headers: WebhookHeaders, options: VerifyEventOptions): Promise<WebhookEvent>;

  /**
   * Creates a route handler that verifies deliveries and calls your handlers.
   *
   * The handler takes a fetch `Request` and returns a `Response`, so it works as a Next.js route
   * handler and in Hono, Cloudflare Workers, Deno and Bun. For each request it reads the raw body,
   * verifies it, answers the activation probe itself, and then calls `onEvent`, the event's handler in
   * `on`, and `onSuccess`, in that order.
   *
   * It answers with:
   * - 204 when the event was handled, including events with no handler.
   * - 400 when the delivery doesn't verify.
   * - 500 when the public keys are misconfigured or a callback throws. Base44 then retries.
   *
   * Base44 can deliver the same event more than once, so make your handlers safe to run twice for the
   * same `event.id`.
   *
   * @param options - Your public keys, handlers and callbacks.
   * @returns A function that takes a `Request` and resolves to the `Response` to send.
   *
   * @example
   * ```typescript
   * // Handle app events in a Next.js route
   * export const POST = platform.webhooks.createHandler({
   *   publicKeys: process.env.BASE44_WEBHOOK_PUBLIC_KEYS,
   *   on: {
   *     'app.deleted.v1': async (event) => removeApp(event.data.app_id),
   *     'app.published.v1': async (event) => refreshApp(event.data.app_id),
   *   },
   *   onError(error, event) {
   *     console.error('Webhook failed', event?.id, error);
   *   },
   * });
   * ```
   */
  createHandler(options: CreateHandlerOptions): (request: Request) => Promise<Response>;
}
