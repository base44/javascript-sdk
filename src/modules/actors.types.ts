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

/** Options for {@link ActorRoom.connect}. */
export interface ActorConnectOptions {
  /**
   * The connection id — becomes the actor's `conn.id`. Supply a stable value
   * (e.g. persisted per tab) so a reconnect reuses the same server-side
   * identity; omit for an auto-generated per-connection id.
   */
  id?: string;
}

/** Handle for one listener registered via {@link ActorRoom.subscribe}. */
export interface ActorSubscription {
  /** Remove this listener; other listeners and the socket stay live. */
  unsubscribe(): void;
}

/**
 * A single actor room. Obtained from {@link ActorClient} (`actors.MyActor(id)`)
 * and made live with {@link connect}. The handle IS the connection: one socket,
 * any number of {@link subscribe} listeners.
 */
export interface ActorRoom<N extends string = string> {
  /** The connection id (the value the actor sees as `conn.id`). Throws before {@link connect}. */
  readonly id: string;

  /** Open the WebSocket (required before subscribe/send). Idempotent; returns this. */
  connect(options?: ActorConnectOptions): this;

  /** Register a message listener. Multiple are allowed; returns a per-listener unsubscribe. */
  subscribe(callback: (data: ToClientFor<N>) => void): ActorSubscription;

  /** Send a message. Throws before {@link connect}; buffered by the socket until open. */
  send(data: ToServerFor<N>): void;

  /** Tear down the socket, heartbeat, and all listeners. */
  close(): void;
}

/**
 * Client for a single named Actor — call it with a room id to get an
 * {@link ActorRoom}. Typed automatically when the actor is registered in
 * {@link ActorRegistry}.
 */
export interface ActorClient<N extends string = string> {
  (instanceId: string): ActorRoom<N>;
}

/**
 * The actors module provides access to Cloudflare Durable Object-backed
 * Actors deployed by the Base44 platform.
 *
 * ```typescript
 * const room = base44.actors.MyActor("room-1").connect();
 * const sub = room.subscribe((msg) => console.log(msg)); // typed via ActorRegistry
 * room.send({ type: "message", text: "hi" });
 * sub.unsubscribe();
 * room.close();
 * ```
 */
export type ActorsModule = {
  [K in AllActorNames]: K extends keyof ActorRegistry
    ? ActorClient<string & K>
    : ActorClient;
} & Record<string, ActorClient>;
