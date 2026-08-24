import type { ActorConnectionError } from "./actors.error.js";

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
   * (e.g. persisted per tab) containing 1–64 letters, numbers, underscores, or
   * hyphens so a reconnect reuses the same server-side identity; omit for an
   * auto-generated per-connection id.
   */
  id?: string;

  /**
   * Called when this connection's bootstrap or WebSocket fails. Retryable
   * failures may be reported more than once — the connection keeps retrying
   * until it either succeeds or exhausts its attempt budget, and the final
   * report before it gives up is the one where {@link Connection.closed}
   * becomes `true`.
   *
   * Accepted only on the call that creates the connection: a later
   * `connect({ onError })` throws, because a handler registered then could
   * never be removed. Use {@link Connection.addErrorListener} for that.
   */
  onError?: (error: ActorConnectionError) => void;
}

/** Handle for one connection listener. */
export interface ActorSubscription {
  /** Remove this listener; other listeners and the connection stay live. */
  unsubscribe(): void;
}

/**
 * A connection to an actor instance, returned by {@link ActorRef.connect}.
 */
export interface Connection<N extends string = string> {
  /** The connection id (the value the actor sees as `conn.id`). */
  readonly id: string;

  /** Whether this connection has been explicitly or terminally closed. */
  readonly closed: boolean;

  /** Register a detachable connection-error listener. Throws if the connection has closed. */
  addErrorListener(listener?: (error: ActorConnectionError) => void): ActorSubscription;

  /** Register a message listener. Throws if the connection has closed. */
  subscribe(callback: (data: ToClientFor<N>) => void): ActorSubscription;

  /** Send a message. Buffered until open; throws instead of buffering after close. */
  send(data: ToServerFor<N>): void;

  /** Tear down the socket, heartbeat, and all listeners. */
  close(): void;
}

/**
 * A handle to one actor instance — `base44.actors.MyActor(id)`. Call
 * {@link connect} to open the socket and get a {@link Connection}.
 */
export interface ActorRef<N extends string = string> {
  /**
   * Open the WebSocket and return the {@link Connection}. Repeated calls reuse
   * the live connection; a conflicting explicit id, or an `onError` handler the
   * reused connection could not later detach, throws.
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
