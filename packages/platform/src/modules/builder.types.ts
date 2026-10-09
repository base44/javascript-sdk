import type { PlatformEvent, PlatformSnapshot } from "./builder.events.types.js";
import type { PlatformSocketError } from "../errors.js";

/** Options for {@linkcode BuilderModule.init | init()}. */
export interface BuilderInitOptions {
  /**
   * Called on errors that affect the whole session, such as a failed connection or an ended session.
   * Errors for one app go to that subscription's `onError` instead. See the
   * [error codes](/developers/references/platform-sdk/docs/classes/PlatformSocketError#platformsocketerrorcode).
   */
  onError: (error: PlatformSocketError) => void;
}

/**
 * Builder module for following the AI chat in your users' apps live.
 *
 * Each session holds one socket and up to eight app subscriptions. For each app you get a
 * snapshot of its chat, then every change as it happens:
 * - New and updated chat messages, with the AI's tool calls.
 * - The AI's status, from processing to ready.
 * - Preview reloads and navigation, the prompt queue, and generated images.
 *
 * The module does nothing until you call {@linkcode init | init()}.
 */
export interface BuilderModule {
  /**
   * Creates a builder session without connecting it.
   *
   * Call {@linkcode BuilderSession.connect | connect()} on the returned session to open the socket.
   * Each session is independent, with its own socket, token and subscriptions.
   *
   * @param options - Session options.
   * @returns The new session. Use its [session methods](#session-methods) to connect and subscribe.
   *
   * @example
   * ```typescript
   * // Create and connect a session
   * const builder = client.builder.init({
   *   onError(error) {
   *     console.error('Builder session error', error.code);
   *   },
   * });
   * await builder.connect();
   * ```
   */
  init(options: BuilderInitOptions): BuilderSession;
}

/** One builder session. It owns its socket, its subscriptions and its reconnection. */
export interface BuilderSession {
  /**
   * Connects the session's socket.
   *
   * Resolves once the socket connects, before any snapshot arrives. If the connection drops, the
   * session retries five times and rejoins every active subscription, each with a fresh snapshot.
   * An expired or rejected token is replaced once through `getSessionToken`. Concurrent calls share
   * one attempt. Call it again after a failure or a `session_replaced` error.
   *
   * @returns Promise that resolves when the socket connects.
   * @throws {PlatformSocketError} With `connection_denied`, `connection_failed` or `session_unavailable`
   * when the session can't connect, or `client_closed` when the session is closed first.
   *
   * @example
   * ```typescript
   * // Connect and handle failure
   * try {
   *   await builder.connect();
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
   * const subscription = builder.subscribe(appId, {
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
   * nothing. A closed session can't be reused, so call [`init()`](/developers/references/platform-sdk/docs/interfaces/builder#init)
   * for a new one.
   *
   * @example
   * ```typescript
   * // Close a session
   * builder.close();
   * ```
   */
  close(): void;
}

/** Callbacks for one app subscription. */
export interface SubscriptionOptions {
  /**
   * Called with the app's current state. Replace everything you hold for the app with it.
   *
   * Arrives after every join and rejoin, and after the main conversation is rewritten by an undo,
   * restore or sync. Live events follow it. It holds only the last 50 messages, so merge by message
   * ID to keep older history.
   */
  onSnapshot: (snapshot: PlatformSnapshot) => void | Promise<void>;
  /**
   * Called with each live event, a [`PlatformEvent`](#platformevent). Events for an app arrive one at a time, in order. If the callback
   * throws or rejects, the subscription ends with `handler_failed`. New event types can be added at
   * any time, so ignore types you don't handle. For every event and its payload,
   * see the [events reference](/developers/references/platform-sdk/live-updates/events).
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
