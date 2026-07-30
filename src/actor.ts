/**
 * Type-only base class for Actors.
 *
 * Import and extend this in your actor files:
 *   import { Actor } from "@base44/sdk";
 *   export class MyActor extends Actor { ... }
 *
 * At deploy time the bundler replaces this import with the compiled
 * Cloudflare Durable Object implementation — this file provides types only.
 */

import type { Base44Client } from "./client";

/**
 * A single client connection. `Send` is the message type this connection accepts
 * via {@link send} — the actor's *outgoing* (server→client) messages.
 */
export interface Conn<Send = unknown> {
  /** Unique per-connection id (one per socket/tab), the same value the client
   *  receives from `subscribe()`. Identifies a distinct client, so multiple
   *  tabs are separate connections. */
  id: string;
  send(data: Send): void;
  reject(code: number, reason: string): void;
}

export interface Storage {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<boolean>;
  /** Wipe the room's entire persisted storage (match-end cleanup). Safe: a
   *  later rejoin re-bootstraps exactly like a brand-new room. */
  deleteAll(): Promise<void>;
}

/**
 * Base class for an Actor.
 *
 * @typeParam Incoming - messages this actor *receives* from clients
 *   (`handleMessage`'s `msg`) — the schema's `toServer` section.
 * @typeParam Outgoing - messages this actor *sends* to clients
 *   (`conn.send`/`broadcast`) — the schema's `toClient` section.
 *
 * With a generated `schema.jsonc`, wire both from the registry so they can't drift
 * from the client's types:
 * ```ts
 * type Reg = ActorRegistry["MyActor"];
 * class MyActor extends Actor<Reg["toServer"], Reg["toClient"]> { ... }
 * ```
 */
export abstract class Actor<Incoming = unknown, Outgoing = unknown> {
  abstract handleConnect(conn: Conn<Outgoing>): void | Promise<void>;
  abstract handleMessage(conn: Conn<Outgoing>, msg: Incoming): void | Promise<void>;
  abstract handleClose(conn: Conn<Outgoing>): void | Promise<void>;
  abstract handleTick(): void | Promise<void>;

  /**
   * Optional wake hook: runs once when the instance starts, before any
   * connection is handled — safe to load persisted state here.
   */
  handleStart(): void | Promise<void> {}

  /**
   * Optional handler for scheduled wakes. Runs when a timer armed via
   * {@link schedule} comes due, receiving the same `key` that was scheduled.
   * The schedule is one-shot: it fires once and is cleared before this runs.
   */
  protected handleWake(_key: string): void | Promise<void> {}

  /**
   * Arm a one-shot wake at `at` (epoch ms or a `Date`), identified by `key`.
   * When it comes due the platform calls {@link handleWake} with this `key`.
   * Scheduling the same `key` again reschedules it.
   */
  protected schedule(_key: string, _at: number | Date): Promise<void> {
    throw new Error("Actor.schedule() is only available inside a deployed actor");
  }

  /** Cancel a pending wake previously armed with {@link schedule}. */
  protected cancelSchedule(_key: string): Promise<void> {
    throw new Error("Actor.cancelSchedule() is only available inside a deployed actor");
  }

  /**
   * Managed ticker (opt-in). Override {@link shouldTick} and the platform runs
   * {@link handleTick} on a timer of {@link tickIntervalMs} while it returns true,
   * and stops (letting the Durable Object hibernate — no compute cost) when it
   * returns false. The platform owns scheduling, rescheduling, self-heal, and
   * error-safety.
   *
   * Re-evaluated after every connect/message/close and on every tick, so keep it
   * cheap and pure (no async, no side effects). Example: `return this.players >= 2`.
   */
  protected tickIntervalMs = 100;
  protected shouldTick?(): boolean;

  protected broadcast(_data: Outgoing): void {
    throw new Error("Actor.broadcast() is only available inside a deployed actor");
  }

  protected getConnections(): Conn<Outgoing>[] {
    throw new Error("Actor.getConnections() is only available inside a deployed actor");
  }

  protected get instanceId(): string {
    throw new Error("Actor.instanceId is only available inside a deployed actor");
  }

  protected get storage(): Storage {
    throw new Error("Actor.storage is only available inside a deployed actor");
  }

  /**
   * Anonymous Base44 client scoped to this actor instance — no user or service
   * auth, so entity access is RLS-gated (same as a logged-out visitor). Always
   * operates on production data: an actor runs server-side with no per-connection
   * identity, so a Test DB preview selected in the editor does not apply here.
   * Example: `const rows = await this.client.entities.Score.list();`
   */
  protected get client(): Base44Client {
    throw new Error("Actor.client is only available inside a deployed actor");
  }
}
