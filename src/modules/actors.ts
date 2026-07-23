import PartySocket from "partysocket";
import type {
  ActorConnectOptions,
  ActorRoom,
  ActorSubscription,
} from "./actors.types.js";

interface ActorsConfig {
  appId: string;
  /** Current user access token, if authenticated. Rides the WS query so the
   * platform proxy can authenticate the connection; anonymous connects omit it. */
  getAuthToken(): string | null | undefined;
  /** Same semantics as function calls: editors with a non-prod version get the
   * draft actor script; everyone else gets the published one. */
  functionsVersion?: string;
  dispatcherWsUrl: string;
  /** WebSocket implementation for runtimes without a global one (Node < 22). */
  webSocketImpl?: unknown;
}

// Heartbeat / half-open detection: PartySocket only reconnects on a close/error
// event, so ping periodically and force a reconnect if nothing returns in DEAD_MS.
const PING_MS = 1_000;
const DEAD_MS = 3_000;

class Room {
  private ws: PartySocket | null = null;
  private readonly listeners = new Set<(data: unknown) => void>();
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private connId: string | null = null;

  constructor(
    private readonly actorName: string,
    private readonly instanceId: string,
    private readonly config: ActorsConfig,
  ) {}

  get id(): string {
    if (!this.connId) {
      throw new Error(`${this.actorName}:${this.instanceId}: connect() before reading id`);
    }
    return this.connId;
  }

  connect(options?: ActorConnectOptions): this {
    if (this.ws) return this;

    // The client picks its own conn id; it becomes _pk → the actor's conn.id.
    const connId = options?.id ?? crypto.randomUUID();
    this.connId = connId;

    const ws = new PartySocket({
      host: this.config.dispatcherWsUrl,
      party: this.actorName,
      room: this.instanceId,
      id: connId,
      ...(this.config.webSocketImpl ? { WebSocket: this.config.webSocketImpl as any } : {}),
      // Re-read on every (re)connect so a login/logout is picked up.
      query: () => {
        const token = this.config.getAuthToken();
        return {
          app_id: this.config.appId,
          handler: this.actorName,
          ...(token ? { token } : {}),
          ...(this.config.functionsVersion ? { fv: this.config.functionsVersion } : {}),
        };
      },
    });
    this.ws = ws;

    let lastMsg = Date.now();
    const bumpAlive = () => { lastMsg = Date.now(); };
    ws.addEventListener("open", bumpAlive);
    ws.addEventListener("message", (ev) => {
      bumpAlive();
      let data: unknown;
      try {
        data = JSON.parse(ev.data);
      } catch {
        return; // ignore malformed
      }
      const msgType = data && typeof data === "object" ? (data as { type?: unknown }).type : undefined;
      if (msgType === "__pong") return; // platform message — never surface it
      for (const listener of this.listeners) listener(data);
    });

    this.heartbeat = setInterval(() => {
      if (Date.now() - lastMsg > DEAD_MS) {
        bumpAlive(); // avoid a reconnect storm while the new socket comes up
        ws.reconnect();
        return;
      }
      try {
        ws.send(JSON.stringify({ type: "__ping" }));
      } catch {
        // socket not open; the watchdog above will force a reconnect
      }
    }, PING_MS);

    return this;
  }

  subscribe(callback: (data: unknown) => void): ActorSubscription {
    if (!this.ws) {
      throw new Error(`${this.actorName}:${this.instanceId}: connect() before subscribe()`);
    }
    this.listeners.add(callback);
    return {
      unsubscribe: () => { this.listeners.delete(callback); },
    };
  }

  send(data: unknown): void {
    if (!this.ws) {
      throw new Error(`${this.actorName}:${this.instanceId}: connect() before send()`);
    }
    this.ws.send(JSON.stringify(data));
  }

  close(): void {
    if (this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
    this.listeners.clear();
    this.ws?.close();
    this.ws = null;
  }
}

export function createActorsModule(config: ActorsConfig) {
  return new Proxy({} as Record<string, (instanceId: string) => ActorRoom>, {
    get(_, actorName: string) {
      return (instanceId: string) => new Room(actorName, instanceId, config) as unknown as ActorRoom;
    },
  });
}
