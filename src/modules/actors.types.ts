/**
 * Extend this interface to add typed `subscribe` callbacks and `send` payloads
 * for your deployed Actors.
 *
 * This is separate from `ActorNameRegistry` (which is auto-generated
 * by `base44 types generate`), so there are no conflicts.
 *
 * @example
 * ```typescript
 * // Declare message types for a deployed actor
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
 * Do not edit this interface manually. Use `ActorRegistry` for message types.
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

/** Options for [connect()](#connect). */
export interface ActorConnectOptions {
  /**
   * The connection id, used as the actor's `conn.id`. Supply a stable value,
   * such as one persisted per tab, so a reconnect reuses the same server-side
   * identity. Omit it for an auto-generated per-connection id.
   */
  id?: string;
}

/** Handle for one listener registered via `subscribe()`. */
export interface ActorSubscription {
  /**
   * Removes this listener. Other listeners on the same connection, and the
   * connection itself, stay live. To close the connection as well, call
   * [close()](#close).
   *
   * @example
   * ```typescript
   * // Stop listening without closing the connection
   * const sub = conn.subscribe((msg) => console.log(msg));
   * sub.unsubscribe();
   * ```
   */
  unsubscribe(): void;
}

/**
 * A live connection to an actor instance, returned by [connect()](#connect).
 * `subscribe`/`send` are always valid. You only get a `Connection` once the
 * socket has been opened, so there's no pre-connect state to guard against.
 */
export interface Connection<N extends string = string> {
  /** The connection id, which is the value the actor sees as `conn.id`. */
  readonly id: string;

  /**
   * Registers a listener for messages sent by the actor. Any number of
   * listeners can be registered on one connection, and each receives every
   * message.
   *
   * The callback payload is typed when the actor is declared in
   * [ActorRegistry](#actorregistry), and is `unknown` otherwise.
   *
   * @param callback - Called with each message the actor sends to this client.
   * @returns An `ActorSubscription` that removes this one listener.
   *
   * @example
   * ```typescript
   * // Listen for messages from the actor
   * const sub = conn.subscribe((msg) => {
   *   if (msg.type === "message") console.log(msg.text);
   * });
   * ```
   */
  subscribe(callback: (data: ToClientFor<N>) => void): ActorSubscription;

  /**
   * Sends a message to the actor.
   *
   * Messages sent before the socket finishes opening are buffered and flushed
   * on open. Messages sent after {@link close} are dropped silently.
   *
   * The payload is typed when the actor is declared in
   * [ActorRegistry](#actorregistry), and is `unknown` otherwise.
   *
   * @param data - The message to send to the actor.
   *
   * @example
   * ```typescript
   * // Send a message to the actor
   * conn.send({ type: "message", text: "hi" });
   * ```
   */
  send(data: ToServerFor<N>): void;

  /**
   * Closes the connection, tearing down the socket, the heartbeat, and every
   * listener registered on it. Safe to call more than once.
   *
   * A connection also closes itself when it fails permanently. See
   * [connect()](#connect) for how to recover from that.
   *
   * @example
   * ```typescript
   * // Close when the view that opened the connection goes away.
   * useEffect(() => {
   *   const conn = base44.actors.ChatRoom(roomId).connect();
   *   conn.subscribe(setMessage);
   *   return () => conn.close();
   * }, [roomId]);
   * ```
   */
  close(): void;
}

/**
 * A handle to one actor instance, obtained from `base44.actors.MyActor(id)`. Call
 * {@link connect} to open the socket and get a [Connection](#connection).
 */
export interface ActorRef<N extends string = string> {
  /**
   * Opens the WebSocket to this actor instance and returns the
   * [Connection](#connection). Idempotent while the connection is open, so calling it
   * again returns the same connection rather than opening a second socket.
   *
   * The returned connection is usable straight away. Messages passed to
   * [send()](#send) before the socket finishes opening are buffered and
   * flushed on open.
   *
   * A connection that fails permanently, for example because the actor doesn't
   * exist or the caller isn't allowed to connect, closes itself and reports the
   * error to the client's `onError` handler. Call `connect()` again once the
   * cause is fixed to get a fresh [Connection](#connection), then re-subscribe, as
   * listeners do not carry over.
   *
   * @param options - Connection options. See [ActorConnectOptions](#actorconnectoptions).
   * @returns A live [Connection](#connection) to this actor instance.
   *
   * @example
   * ```typescript
   * // Connect to an actor instance
   * const conn = base44.actors.ChatRoom("room-1").connect();
   * ```
   *
   * @example
   * ```typescript
   * // Reuse a stable connection id so a reconnect keeps the same
   * // server-side identity.
   * let id = sessionStorage.getItem("chat-conn-id") ?? crypto.randomUUID();
   * sessionStorage.setItem("chat-conn-id", id);
   *
   * const conn = base44.actors.ChatRoom("room-1").connect({ id });
   * ```
   */
  connect(options?: ActorConnectOptions): Connection<N>;
}

/**
 * Client for a single named Actor. Call it with an instance id to get an
 * [ActorRef](#actorref). Typed automatically when the actor is registered in
 * [ActorRegistry](#actorregistry).
 */
export interface ActorClient<N extends string = string> {
  (instanceId: string): ActorRef<N>;
}

/**
 * Actors module for real-time messaging with Cloudflare Durable Object-backed
 * Actors deployed by the Base44 platform.
 *
 * An Actor is a named server-side object with persistent state. Each instance
 * is addressed by an id, so `base44.actors.ChatRoom("room-1")` and
 * `base44.actors.ChatRoom("room-2")` are separate instances with separate
 * state. Clients open a WebSocket to an instance and exchange messages with it.
 *
 * This module provides:
 * - Per-instance WebSocket connections, opened with [connect()](#connect)
 * - Message listeners, registered with [subscribe()](#subscribe)
 * - Message sending, with [send()](#send)
 * - Automatic reconnection with backoff, including recovery from half-open
 *   sockets that stop delivering messages without emitting a close event
 * - End-to-end typing of message payloads through [ActorRegistry](#actorregistry)
 *
 * This module is available to use with a client in anonymous and user
 * authentication modes. It is not available on `base44.asServiceRole`.
 *
 * Connections stay open until you call [close()](#close), so close them
 * when the view that opened them goes away.
 *
 * @example
 * ```typescript
 * // Open a connection to one instance of the ChatRoom actor.
 * const conn = base44.actors.ChatRoom("room-1").connect();
 *
 * const sub = conn.subscribe((msg) => {
 *   console.log(msg);
 * });
 *
 * conn.send({ type: "message", text: "hi" });
 *
 * // Later, when the view goes away.
 * sub.unsubscribe();
 * conn.close();
 * ```
 *
 * @example
 * ```typescript
 * // Register the actor to type both directions of the conversation.
 * declare module "@base44/sdk" {
 *   interface ActorRegistry {
 *     ChatRoom: {
 *       toClient: { type: "joined" | "message"; from?: string; text?: string };
 *       toServer: { type: "message"; text: string };
 *     };
 *   }
 * }
 *
 * const conn = base44.actors.ChatRoom("room-1").connect();
 * conn.subscribe((msg) => {
 *   // msg is typed as the toClient union.
 *   if (msg.type === "message") console.log(msg.text);
 * });
 * ```
 */
export type ActorsModule = {
  [K in AllActorNames]: K extends keyof ActorRegistry
    ? ActorClient<string & K>
    : ActorClient;
} & Record<string, ActorClient>;
