/**
 * Type-only base class for Realtime Handlers.
 *
 * Import and extend this in your handler files:
 *   import { RealtimeHandler } from "@base44/sdk";
 *   export class MyHandler extends RealtimeHandler { ... }
 *
 * At deploy time the bundler replaces this import with the compiled
 * Cloudflare Durable Object implementation — this file provides types only.
 */

import type { Base44Client } from "./client.types.js";

/**
 * A single client connection. `Send` is the message type this connection accepts
 * via {@link send} — the handler's *outgoing* (server→client) messages.
 */
export interface Conn<Send = unknown> {
  /** Unique per-connection id (one per socket/tab), the same value the client
   *  receives from `subscribe()`. Use this — not userId — to identify a distinct
   *  client, so multiple tabs of the same user are separate connections. */
  id: string;
  userId: string;
  appId: string;
  instanceId: string;
  send(data: Send): void;
  reject(code: number, reason: string): void;
}

export interface Storage {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<boolean>;
}


/**
 * Base class for a Realtime Handler.
 *
 * @typeParam Incoming - messages this handler *receives* from clients
 *   (`handleMessage`'s `msg`) — the schema's `toServer` section.
 * @typeParam Outgoing - messages this handler *sends* to clients
 *   (`conn.send`/`broadcast`) — the schema's `toClient` section.
 *
 * With a generated `schema.jsonc`, wire both from the registry so they can't drift
 * from the client's types:
 * ```ts
 * type Reg = RealtimeHandlerRegistry["MyHandler"];
 * class MyHandler extends RealtimeHandler<Reg["toServer"], Reg["toClient"]> { ... }
 * ```
 */
export abstract class RealtimeHandler<Incoming = unknown, Outgoing = unknown> {
  abstract handleConnect(conn: Conn<Outgoing>): void | Promise<void>;
  abstract handleMessage(conn: Conn<Outgoing>, msg: Incoming): void | Promise<void>;
  abstract handleClose(conn: Conn<Outgoing>): void | Promise<void>;
  abstract handleTick(): void | Promise<void>;

  onStart(): void | Promise<void> {}

  /**
   * Managed ticker (opt-in). Override {@link shouldTick} and the platform runs
   * {@link handleTick} on a timer of {@link tickIntervalMs} while it returns true,
   * and stops (letting the Durable Object hibernate — no compute cost) when it
   * returns false. The platform owns scheduling, rescheduling, self-heal, and
   * error-safety — you don't call {@link startLoop}/{@link stopLoop}.
   *
   * Re-evaluated after every connect/message/close and on every tick, so keep it
   * cheap and pure (no async, no side effects). Example: `return this.players >= 2`.
   */
  protected tickIntervalMs = 100;
  protected shouldTick?(): boolean;

  protected broadcast(_data: Outgoing): void {
    throw new Error("RealtimeHandler.broadcast() is only available inside a deployed handler");
  }

  protected getConnections(): Conn<Outgoing>[] {
    throw new Error("RealtimeHandler.getConnections() is only available inside a deployed handler");
  }

  protected startLoop(_ms: number): Promise<void> {
    throw new Error("RealtimeHandler.startLoop() is only available inside a deployed handler");
  }

  protected stopLoop(): Promise<void> {
    throw new Error("RealtimeHandler.stopLoop() is only available inside a deployed handler");
  }

  protected get instanceId(): string {
    throw new Error("RealtimeHandler.instanceId is only available inside a deployed handler");
  }

  protected get storage(): Storage {
    throw new Error("RealtimeHandler.storage is only available inside a deployed handler");
  }

  /**
   * SDK client acting **as the connected user** — every entity call respects
   * the app's row-level security, evaluated as that user at call time. The
   * default wherever a `conn` is in scope (connect/message/close).
   *
   * Anonymous connections get an unauthenticated client — entity calls run
   * under anonymous RLS, just like any public visitor.
   */
  protected createUserClient(conn: Conn): Base44Client {
    void conn;
    throw new Error("RealtimeHandler.createUserClient() is only available inside a deployed handler");
  }

  /**
   * Service-role SDK client — bypasses RLS. For work with **no user in scope**
   * (tick, alarm, onStart). Inside handleMessage/handleConnect prefer
   * `createUserClient(conn)`.
   */
  protected createServiceClient(): Base44Client {
    throw new Error("RealtimeHandler.createServiceClient() is only available inside a deployed handler");
  }
}
