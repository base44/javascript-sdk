/**
 * Extend this interface to add typed `subscribe` callbacks and `send` payloads
 * for your deployed Actors.
 *
 * This is separate from {@link ActorNameRegistry} (which is auto-generated
 * by `base44 types generate`), so there are no conflicts.
 *
 * @example
 * ```typescript
 * declare module "@base44/sdk" {
 *   interface ActorRegistry {
 *     ChatRoom: {
 *       toClient: { type: "joined" | "left" | "message"; userId?: string; from?: string; text?: string };
 *       toServer: { type: "message"; text: string };
 *     };
 *   }
 * }
 * ```
 */
export interface ActorRegistry {}

/**
 * Auto-populated by `base44 types generate` with the names of your deployed actors.
 * Do not edit this interface manually — use {@link ActorRegistry} for message types.
 */
export interface ActorNameRegistry {}

type AllActorNames = keyof ActorRegistry | keyof ActorNameRegistry;

type ToClientFor<N extends string> = N extends keyof ActorRegistry
  ? ActorRegistry[N] extends { toClient: infer I }
    ? I
    : unknown
  : unknown;

type ToServerFor<N extends string> = N extends keyof ActorRegistry
  ? ActorRegistry[N] extends { toServer: infer O }
    ? O
    : unknown
  : unknown;

/** Options for {@link ActorRef.connect}. */
export interface ActorConnectOptions {
  /**
   * The connection id — becomes the actor's `conn.id`. Supply a stable value
   * (e.g. persisted per tab) so a reconnect reuses the same server-side
   * identity; omit for an auto-generated per-connection id.
   */
  id?: string;
}

/** Handle for one listener registered via {@link Connection.subscribe}. */
export interface ActorSubscription {
  /** Remove this listener; other listeners and the socket stay live. */
  unsubscribe(): void;
}

/**
 * A live connection to an actor instance, returned by {@link ActorRef.connect}.
 * `subscribe`/`send` are always valid — you only get a `Connection` once the
 * socket has been opened, so there's no pre-connect state to guard against.
 */
export interface Connection<N extends string = string> {
  /** The connection id (the value the actor sees as `conn.id`). */
  readonly id: string;

  /** Register a message listener. Multiple are allowed; returns a per-listener unsubscribe. */
  subscribe(callback: (data: ToClientFor<N>) => void): ActorSubscription;

  /** Send a message. Buffered by the socket until it's open; dropped after
   * {@link close}. */
  send(data: ToServerFor<N>): void;

  /**
   * Tear down the socket, heartbeat, and all listeners. Safe to call more
   * than once. A connection also closes itself when it fails permanently —
   * see {@link ActorRef.connect}.
   */
  close(): void;
}

/**
 * A handle to one actor instance — `base44.actors.MyActor(id)`. Call
 * {@link connect} to open the socket and get a {@link Connection}.
 */
export interface ActorRef<N extends string = string> {
  /**
   * Open the WebSocket and return the {@link Connection}. Idempotent while the
   * connection is open.
   *
   * A connection that fails permanently (for example, the actor doesn't exist
   * or the caller isn't allowed to connect) closes itself and reports the
   * error to the client's `onError` handler. Call `connect()` again after
   * fixing the cause to get a fresh {@link Connection}, and re-subscribe.
   */
  connect(options?: ActorConnectOptions): Connection<N>;
}

/**
 * Client for a single named Actor — call it with an instance id to get an
 * {@link ActorRef}. Typed automatically when the actor is registered in
 * {@link ActorRegistry}.
 */
export interface ActorClient<N extends string = string> {
  (instanceId: string): ActorRef<N>;
}

/**
 * The actors module provides access to Cloudflare Durable Object-backed
 * Actors deployed by the Base44 platform.
 *
 * ```typescript
 * const conn = base44.actors.MyActor("room-1").connect();
 * const sub = conn.subscribe((msg) => console.log(msg)); // typed via ActorRegistry
 * conn.send({ type: "message", text: "hi" });
 * sub.unsubscribe();
 * conn.close();
 * ```
 */
export type ActorsModule = {
  [K in AllActorNames]: K extends keyof ActorRegistry
    ? ActorClient<string & K>
    : ActorClient;
} & Record<string, ActorClient>;
