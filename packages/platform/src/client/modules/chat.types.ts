import type { PlatformEvent, PlatformSnapshot } from "./chat.events.types.js";
import type { PlatformSocketError } from "../errors.js";

/**
 * The three fields of a [Create socket session](/api-reference/create-socket-session) response that
 * your `getSession()` callback returns. Keep the response's `session_id` on your server.
 */
export interface SocketSession {
  /** Token that authenticates the socket. The client keeps it in memory and sends it only when the socket connects. */
  session_token: string;
  /** Origin of the platform socket, with no path, query, fragment, or credentials. */
  socket_url: string;
  /** Absolute path the socket connects on, such as `/ws/socket.io/`. */
  socket_path: string;
}

/** Options for {@linkcode ChatModule.init | init()}. */
export interface ChatInitOptions {
  /**
   * Returns a new socket session from your server.
   *
   * Return the `session_token`, `socket_url`, and `socket_path` of a
   * [Create socket session](/api-reference/create-socket-session) response as a
   * [`SocketSession`](#socketsession), and keep its `session_id` on your server. Return a new
   * session on every call. The client calls
   * `getSession()` on the first {@linkcode ChatSession.connect | connect()}, and again only when
   * the session expires or Base44 rejects its token. If a new session has a different `socket_url`
   * or `socket_path`, the client moves to it and rejoins every active subscription.
   *
   * @returns The session's `session_token`, `socket_url`, and `socket_path`.
   */
  getSession: () => Promise<SocketSession>;
  /**
   * Called on errors that affect the whole session, such as a failed connection or an ended session.
   * Errors for one app go to that subscription's `onError()` instead. The
   * [error codes](#errors)
   * say what each error means.
   */
  onError: (error: PlatformSocketError) => void;
}

/**
 * Chat module for following the AI chat of your users' apps in real time. Call
 * {@linkcode init | init()} to create a session and start following.
 *
 * A session holds one socket and up to eight app subscriptions. For each app, you get a
 * snapshot of the app's chat, then every change as it happens:
 * - New and updated chat messages, with the AI's tool calls.
 * - The AI's status, from processing to ready.
 * - Preview reloads and navigation, the prompt queue, and generated images.
 */
export interface ChatModule {
  /**
   * Creates a session without connecting it. A [session](#session-methods) is one socket plus the
   * app subscriptions that share it.
   *
   * Pass a `getSession()` callback in the options. The client calls it to get a
   * [socket session](/developers/references/apps-api/sections/socket-sessions), which your server
   * opens with [Create socket session](/api-reference/create-socket-session). Each session is independent and gets its own socket session.
   *
   * Call {@linkcode ChatSession.connect | connect()} on the returned session to open the socket.
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
   *     console.error('Live updates error', error.code);
   *   },
   * });
   * await chat.connect();
   * ```
   */
  init(options: ChatInitOptions): ChatSession;
}

/**
 * A session is one socket plus the app subscriptions that share it, and it reconnects automatically
 * if the connection drops. Use the methods below to connect the socket, follow apps, and close the
 * session.
 */
export interface ChatSession {
  /**
   * Connects the session's socket.
   *
   * The first call gets a socket session from [`getSession()`](#init). If the session has expired
   * or Base44 rejects its token, the client calls `getSession()` once more for a new one.
   * Concurrent calls share one attempt.
   *
   * The promise resolves once the socket connects, before any snapshot arrives. If the connection
   * drops, the session retries five times and rejoins every active subscription, each with a fresh
   * snapshot.
   *
   * Call `connect()` again after a failure or a `session_replaced` error.
   *
   * @returns A promise that resolves when the socket connects.
   * @throws {PlatformSocketError} The promise rejects with a `PlatformSocketError` whose code is
   * `connection_denied`, `connection_failed`, or `session_unavailable` when the session can't connect,
   * or `client_closed` when the session is closed first.
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
   * Subscribes to an app's chat.
   *
   * You can subscribe before or after connecting. A session has one subscription per app, up to
   * eight in total. A session can only follow apps your server gave the session access to, either
   * in [Create socket session](/api-reference/create-socket-session) or later with
   * [Add app to session](/api-reference/add-app-to-session). Subscribing to any other app fails
   * with `access_denied`. The subscription first receives a snapshot of the app, then each live
   * event.
   *
   * Pass `onSnapshot()`, `onEvent()`, and `onError()` callbacks in the options to receive the app's
   * snapshot, live events, and errors.
   *
   * Callbacks for an app run one at a time, in order. If a callback returns a promise, the session
   * waits for it before calling the next callback for that app. Each app has its own queue, so a
   * slow callback for one app doesn't delay the others. If more than 1,000 snapshots and events are
   * waiting for an app's callbacks, the subscription ends with `delivery_overflow`.
   *
   * @param appId - ID of the app to follow, 24 lowercase hexadecimal characters.
   * @param options - Callbacks for the app's snapshots, events, and errors.
   * @returns The subscription.
   * @throws {TypeError} The method throws a `TypeError` when `appId` isn't a valid app ID or the app already has a subscription.
   * @throws {PlatformSocketError} The method throws a `PlatformSocketError` whose code is `subscription_limit` when the session already has eight subscriptions.
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
   * Call `close()` when the page closes or you no longer need live updates. Closing ends every
   * subscription, stops reconnecting, and disconnects the socket. Calling `close()` again does
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
   * Called with the app's current state, a [`PlatformSnapshot`](#platformsnapshot). Replace everything you hold for the app with the snapshot.
   *
   * The snapshot arrives when you subscribe, after every reconnect, and after the main conversation
   * is rewritten by an undo, restore, or sync. Live events follow it. A snapshot holds only the last
   * 50 messages, so load older history again if you show it.
   */
  onSnapshot: (snapshot: PlatformSnapshot) => void | Promise<void>;
  /**
   * Called with each live event, a [`PlatformEvent`](#platformevent). Events for an app arrive one at a time, in order. If the callback
   * throws or rejects, the subscription ends with `handler_failed`.
   *
   * New event types can be added at any time, so ignore the types you don't handle. An event newer
   * than this SDK arrives with `type: "unknown"`, and its event name is in `name`.
   * [Socket messages](/developers/references/apps-api/sections/socket-messages) lists every event
   * and its payload.
   */
  onEvent: (event: PlatformEvent) => void | Promise<void>;
  /**
   * Called on errors for this app. Every error ends the subscription except `snapshot_unavailable`.
   * The [error codes](#errors)
   * say what each error means.
   */
  onError: (error: PlatformSocketError) => void;
}

/** A subscription to an app's chat. */
export interface PlatformSubscription {
  /** ID of the app. */
  readonly appId: string;
  /** Whether the subscription still receives updates. The value becomes `false` after an error or a call to {@linkcode unsubscribe | unsubscribe()}. */
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
