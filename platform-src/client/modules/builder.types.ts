import type { PlatformEvent, Snapshot } from "./builder.events.types.js";
import type { PlatformSocketError } from "../errors.js";

/** Options for an independent builder socket session. */
export interface BuilderInitOptions {
  /** Connection-level errors, sanitized to exclude tokens and server exception text. */
  onError: (error: PlatformSocketError) => void;
}

/** Lazy builder module; no socket exists until init is called. */
export interface BuilderModule {
  /** Create an independent session without connecting. Call connect on the returned session. */
  init(options: BuilderInitOptions): BuilderSession;
}

/** One builder socket session. Owns its subscriptions and connection lifecycle. */
export interface BuilderSession {
  /** Connect with the session token; resolves on CONNECT, before snapshots arrive.
   * Transport loss retries five times and rejoins active subscriptions, each with a fresh
   * snapshot. An expired or rejected session is replaced once through `getSessionToken`.
   * Call again after a failure or `session_replaced`. Concurrent calls share one attempt.
   */
  connect(): Promise<void>;
  /** Subscribe before or after connecting. One subscription per app, up to eight per session,
   * and each app must be on the session's allowlist. Callbacks run serially per app.
   */
  subscribe(appId: string, options: SubscriptionOptions): PlatformSubscription;
  /** Stop this session, its subscriptions and reconnection. Idempotent and terminal. */
  close(): void;
}

/** One app subscription; at most eight may be active per builder session. */
export interface SubscriptionOptions {
  /** Replace this app's state. Arrives after every join and rejoin, and after a main-conversation
   * rewrite (undo, restore, sync). Live events may precede it; merge its messages by `id`.
   */
  onSnapshot: (snapshot: Snapshot) => void | Promise<void>;
  /** Apply each live event. Delivery is serial per app; a rejection ends this subscription. */
  onEvent: (event: PlatformEvent) => void | Promise<void>;
  /** Subscription errors. Only `snapshot_unavailable` leaves the subscription active. */
  onError: (error: PlatformSocketError) => void;
}

/** One app subscription's lifetime. */
export interface PlatformSubscription {
  /** App identifier. */
  readonly appId: string;
  /** True while subscribed; false after an error or explicit unsubscribe. */
  readonly active: boolean;
  /** Stop this app's delivery and release its subscription slot. Idempotent. */
  unsubscribe(): void;
}
