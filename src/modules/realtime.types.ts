/**
 * Extend this interface to add typed `subscribe` callbacks and `send` payloads
 * for your deployed RealtimeHandlers.
 *
 * This is separate from {@link RealtimeHandlerNameRegistry} (which is auto-generated
 * by `base44 types generate`), so there are no conflicts.
 *
 * @example
 * ```typescript
 * declare module "@base44/sdk" {
 *   interface RealtimeHandlerRegistry {
 *     ChatRoom: {
 *       toClient: { type: "joined" | "left" | "message"; userId?: string; from?: string; text?: string };
 *       toServer: { type: "message"; text: string };
 *     };
 *   }
 * }
 * ```
 */
export interface RealtimeHandlerRegistry {}

/**
 * Auto-populated by `base44 types generate` with the names of your deployed handlers.
 * Do not edit this interface manually — use {@link RealtimeHandlerRegistry} for message types.
 */
export interface RealtimeHandlerNameRegistry {}

type AllHandlerNames = keyof RealtimeHandlerRegistry | keyof RealtimeHandlerNameRegistry;

type ToClientFor<N extends string> = N extends keyof RealtimeHandlerRegistry
  ? RealtimeHandlerRegistry[N] extends { toClient: infer I }
    ? I
    : unknown
  : unknown;

type ToServerFor<N extends string> = N extends keyof RealtimeHandlerRegistry
  ? RealtimeHandlerRegistry[N] extends { toServer: infer O }
    ? O
    : unknown
  : unknown;

/**
 * Client for a single named RealtimeHandler.
 * Typed automatically when the handler is registered in {@link RealtimeHandlerRegistry}.
 */
export interface RealtimeHandlerClient<N extends string = string> {
  /**
   * Open a WebSocket subscription. Returns a {@link RealtimeSubscription} with the
   * connection `id` (same value the handler sees as `conn.id`) and an `unsubscribe()` method.
   *
   * Pass `options.id` to control the connection id (e.g. a stable per-tab id so a
   * reconnect reuses the same server-side connection); omit it for an auto-generated
   * per-connection id.
   */
  subscribe(
    instanceId: string,
    callback: (data: ToClientFor<N>) => void,
    options?: { id?: string },
  ): RealtimeSubscription;

  /** Send a message over the open socket. Throws if not subscribed. */
  send(instanceId: string, data: ToServerFor<N>): void;
}

/** Handle for an active realtime subscription. */
export interface RealtimeSubscription {
  /** This connection's id — the same value the handler receives as `conn.id`. */
  id: string;
  /** Close the subscription and its underlying socket. */
  unsubscribe(): void;
}

/**
 * The realtime module provides access to Cloudflare Durable Object-backed
 * RealtimeHandlers deployed by the Base44 platform.
 *
 * Handler names are accessed as dynamic properties on this module:
 * ```typescript
 * const sub = await base44.realtime.MyHandler.subscribe("room-1", (msg) => {
 *   console.log(msg); // typed if MyHandler is in RealtimeHandlerRegistry
 * });
 * const { id, unsubscribe } = sub;
 * unsubscribe();
 * ```
 */
export type RealtimeModule = {
  [K in AllHandlerNames]: K extends keyof RealtimeHandlerRegistry
    ? RealtimeHandlerClient<string & K>
    : RealtimeHandlerClient;
} & Record<string, RealtimeHandlerClient>;
