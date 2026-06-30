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

export interface Conn {
  userId: string;
  appId: string;
  instanceId: string;
  send(data: unknown): void;
  reject(code: number, reason: string): void;
}

export abstract class RealtimeHandler<_State = unknown, Message = unknown> {
  abstract handleConnect(conn: Conn): void | Promise<void>;
  abstract handleMessage(conn: Conn, msg: Message): void | Promise<void>;
  abstract handleClose(conn: Conn): void | Promise<void>;
  abstract handleTick(): void | Promise<void>;

  protected broadcast(_data: unknown): void {
    throw new Error("RealtimeHandler.broadcast() is only available inside a deployed handler");
  }

  protected getConnections(): Conn[] {
    throw new Error("RealtimeHandler.getConnections() is only available inside a deployed handler");
  }

  protected startLoop(_ms: number): Promise<void> {
    throw new Error("RealtimeHandler.startLoop() is only available inside a deployed handler");
  }

  protected stopLoop(): Promise<void> {
    throw new Error("RealtimeHandler.stopLoop() is only available inside a deployed handler");
  }
}
