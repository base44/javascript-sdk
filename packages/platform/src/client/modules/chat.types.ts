import type { PlatformEvent, PlatformSnapshot } from "./chat.events.types.js";
import type { PlatformSocketError } from "../errors.js";

/**
 * The socket session your server opened, as [Create socket session](/api-reference/create-socket-session) returned it.
 *
 * Pass the response body through unchanged. The client reads these three fields and ignores the
 * rest, such as `session_id` and `expires_in`.
 */
export interface SocketSession {
  /** Token that authenticates the socket. The client keeps it in memory and sends it only when the socket connects. */
  session_token: string;
  /** Origin of the platform socket, with no path, query, fragment or credentials. */
  socket_url: string;
  /** Absolute path the socket connects on, such as `/ws/socket.io/`. */
  socket_path: string;
}

/** Options for {@linkcode ChatModule.init | init()}. */
export interface ChatInitOptions {
  /**
   * Returns a new socket session from your server.
   *
   * Your server opens the session with its workspace API key through
   * [Create socket session](/api-reference/create-socket-session) and returns the response body, a [`SocketSession`](#socketsession).
   * The client calls this on the first `connect()`, and again only when the session expires or
   * Base44 rejects its token. Return a new session on every call. If a new session has a different
   * `socket_url` or `socket_path`, the client moves to it and rejoins every active subscription.
   *
   * @returns The session, as your server received it.
   */
  getSession: () => Promise<SocketSession>;
  /**
   * Called on errors that affect the whole session, such as a failed connection or an ended session.
   * Errors for one app go to that subscription's `onError` instead. See the
   * [error codes](/developers/references/platform-sdk/docs/classes/PlatformSocketError#platformsocketerrorcode).
   */
  onError: (error: PlatformSocketError) => void;
}

/**
 * Chat module for following the AI chat in your users' apps live.
 *
 * Each session holds one socket and up to eight app subscriptions. For each app you get a
 * snapshot of its chat, then every change as it happens:
 * - New and updated chat messages, with the AI's tool calls.
 * - The AI's status, from processing to ready.
 * - Preview reloads and navigation, the prompt queue, and generated images.
 *
 * The module does nothing until you call {@linkcode init | init()}.
 */
export interface ChatModule {
  /**
   * Creates a chat session without connecting it.
   *
   * Call {@linkcode ChatSession.connect | connect()} on the returned session to open the socket.
   * Each session is independent, with its own socket, socket session and subscriptions.
   *
   * @param options - Session options.
   * @returns The new session.
   *
   * @example
   * ```typescript
   * // Create and connect a session
   * const chat = client.chat.init({
   *   async getSession() {
   *     const response = await fetch('/api/chat-socket-session', { method: 'POST' });
   *     return response.json();
   *   },
   *   onError(error) {
   *     console.error('Chat session error', error.code);
   *   },
   * });
   * await chat.connect();
   * ```
   */
  init(options: ChatInitOptions): ChatSession;
}

/**
 * A `ChatSession`: one socket with its app subscriptions and its reconnection. Use its methods
 * to connect, follow apps and close.
 */
export interface ChatSession {
  /**
   * Connects the session's socket.
   *
   * Resolves once the socket connects, before any snapshot arrives. If the connection drops, the
   * session retries five times and rejoins every active subscription, each with a fresh snapshot.
   * The first call fetches a session through `getSession`, and an expired or rejected token is
   * replaced once the same way. Concurrent calls share one attempt. Call it again after a failure or a `session_replaced` error.
   *
   * @returns Promise that resolves when the socket connects.
   * @throws {PlatformSocketError} With `connection_denied`, `connection_failed` or `session_unavailable`
   * when the session can't connect, or `client_closed` when the session is closed first.
   *
   * @example
   * ```typescript
   * // Connect and handle failure
   * try {
   *   await chat.connect();
   * } catch (error) {
   *   console.error('Could not connect', error.code);
   * }
   * ```
   */
  connect(): Promise<void>;
  /**
   * Subscribes to one app's chat.
   *
   * You can subscribe before or after connecting. Each app can have one subscription per session,
   * and a session can have up to eight. The app must be on the session's allowlist. The
   * subscription first receives a snapshot of the app, then each live event.
   *
   * Callbacks for an app run one at a time, in order, and the session waits for a returned promise
   * before the next one. A slow app doesn't hold up the others. If more than 1,000 deliveries wait
   * for one app, its subscription ends with `delivery_overflow`.
   *
   * @param appId - ID of the app to follow, 24 lowercase hexadecimal characters.
   * @param options - Callbacks for the app's snapshots, events and errors.
   * @returns The subscription.
   * @throws {TypeError} When `appId` isn't a valid app ID or the app already has a subscription.
   * @throws {PlatformSocketError} With `subscription_limit` when the session has eight subscriptions.
   *
   * @example
   * ```typescript
   * // Follow an app
   * const subscription = chat.subscribe(appId, {
   *   onSnapshot(snapshot) {
   *     renderChat(snapshot.messages);
   *   },
   *   onEvent(event) {
   *     if (event.type === 'message.updated') upsertMessage(event.data.message);
   *   },
   *   onError(error) {
   *     console.error(`App ${error.appId}`, error.code);
   *   },
   * });
   * ```
   */
  subscribe(appId: string, options: SubscriptionOptions): PlatformSubscription;
  /**
   * Closes the session.
   *
   * Ends every subscription, stops reconnecting and disconnects the socket. Calling it again does
   * nothing. A closed session can't be reused, so call [`init()`](/developers/references/platform-sdk/docs/interfaces/chat#init)
   * for a new one.
   *
   * @example
   * ```typescript
   * // Close a session
   * chat.close();
   * ```
   */
  close(): void;
}

/** Callbacks for one app subscription. */
export interface SubscriptionOptions {
  /**
   * Called with the app's current state, a [`PlatformSnapshot`](#platformsnapshot). Replace everything you hold for the app with it.
   *
   * Arrives after every join and rejoin, and after the main conversation is rewritten by an undo,
   * restore or sync. Live events follow it. It holds only the last 50 messages, so merge by message
   * ID to keep older history.
   */
  onSnapshot: (snapshot: PlatformSnapshot) => void | Promise<void>;
  /**
   * Called with each live event, a [`PlatformEvent`](#platformevent). Events for an app arrive one at a time, in order. If the callback
   * throws or rejects, the subscription ends with `handler_failed`. New event types can be added at
   * any time, so ignore types you don't handle. An event newer than this SDK arrives with
   * `type: "unknown"` and its name in `name`. For every event and its payload,
   * see [Socket messages](/developers/references/apps-api/sections/socket-messages).
   */
  onEvent: (event: PlatformEvent) => void | Promise<void>;
  /**
   * Called on errors for this app. Every error ends the subscription except `snapshot_unavailable`.
   * See the [error codes](/developers/references/platform-sdk/docs/classes/PlatformSocketError#platformsocketerrorcode).
   */
  onError: (error: PlatformSocketError) => void;
}

/** One app subscription. */
export interface PlatformSubscription {
  /** ID of the app. */
  readonly appId: string;
  /** Whether the subscription still receives updates. It turns false after an error or {@linkcode unsubscribe | unsubscribe()}. */
  readonly active: boolean;
  /**
   * Stops updates for the app and frees its subscription slot. Calling it again does nothing.
   *
   * @example
   * ```typescript
   * // Stop following an app
   * subscription.unsubscribe();
   * ```
   */
  unsubscribe(): void;
}

/**
 * @deprecated Renamed to {@linkcode ChatModule}. Removed in 1.0.
 * @hidden
 */
export type BuilderModule = ChatModule;

/**
 * @deprecated Renamed to {@linkcode ChatSession}. Removed in 1.0.
 * @hidden
 */
export type BuilderSession = ChatSession;

/**
 * @deprecated Renamed to {@linkcode ChatInitOptions}. Removed in 1.0.
 * @hidden
 */
export type BuilderInitOptions = ChatInitOptions;
