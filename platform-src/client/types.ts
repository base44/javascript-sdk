import type { Joined, PlatformEvent } from "./events.js";
import type { PlatformSocketError } from "./errors.js";

/** Configuration for the browser platform connection. Never supply an API key. */
export interface PlatformClientOptions {
  /** Origin of the platform service, e.g. https://base44.app. No path/query/credentials. */
  serverUrl: string;
  /** Fetch a browser credential from your backend. Called for every connection attempt. */
  getToken: () => string | Promise<string>;
  /** Connection-level error notification. Errors never include tokens or server exception text. */
  onError: (error: PlatformSocketError) => void;
}

/** One app subscription; at most eight may be active per client. */
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
