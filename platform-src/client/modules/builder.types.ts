import type { Joined, PlatformEvent } from "./builder.events.types.js";
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
  /** Connect with a refreshed browser token; resolves on CONNECT, before app replay completes.
   * Transport loss retries five times and rejoins active subscriptions from applied cursors.
   * Call again after fixing connection/auth failures. Concurrent calls share one attempt.
   */
  connect(): Promise<void>;
  /** Subscribe before or after connecting. One subscription per app, up to eight per session.
   * Callbacks run serially per app; errors stop delivery without advancing the cursor.
   */
  subscribe(appId: string, options: SubscriptionOptions): PlatformSubscription;
  /** Stop this session, its subscriptions and reconnection. Idempotent and terminal. */
  close(): void;
}

/** One app subscription; at most eight may be active per builder session. */
export interface SubscriptionOptions {
  /** Last successfully applied cursor for this app; omit for a fresh live boundary. */
  afterSeq?: string;
  /** Apply each event. Delivery is serial per app; rejection pauses this subscription. */
  onEvent: (event: PlatformEvent) => void | Promise<void>;
  /** Handle subscription errors. Reconcile on resync_required; never silently reset a cursor. */
  onError: (error: PlatformSocketError) => void;
  /** Optional replay-complete notification, awaited before advancing to the boundary cursor. */
  onJoined?: (joined: Joined) => void | Promise<void>;
}

/** Subscription lifetime and last successfully applied cursor. */
export interface PlatformSubscription {
  /** App identifier. */
  readonly appId: string;
  /** Last applied event/boundary cursor; persist alongside the state it describes. */
  readonly cursor: string | undefined;
  /** True while subscribed; false after an error or explicit unsubscribe. */
  readonly active: boolean;
  /** Stop this app's delivery and release its subscription slot. Idempotent. */
  unsubscribe(): void;
}
