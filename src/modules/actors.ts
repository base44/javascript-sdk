import PartySocket from "partysocket";
import type {
  ActorConnectOptions,
  ActorRef,
  Connection as ConnectionType,
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
  /** Absolute host PartySocket dials (it strips the scheme and connects wss, ws
   * for localhost). Resolved by {@link resolveActorsHost}. */
  host: string;
}

// Heartbeat / half-open detection: PartySocket only reconnects on a close/error
// event, so ping periodically and force a reconnect if nothing returns in DEAD_MS.
const PING_MS = 1_000;
const DEAD_MS = 3_000;

/**
 * A live connection to an actor instance. Only obtainable from
 * {@link ActorRef.connect}, so `subscribe`/`send` are always valid — the socket
 * exists for this object's whole lifetime.
 */
class Connection {
  private readonly ws: PartySocket;
  private readonly listeners = new Set<(data: unknown) => void>();
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  /** The client-chosen conn id — becomes _pk → the actor's conn.id. */
  readonly id: string;

  constructor(
    actorName: string,
    instanceId: string,
    config: ActorsConfig,
    options: ActorConnectOptions | undefined,
    private readonly onClose: () => void,
  ) {
    this.id = options?.id ?? crypto.randomUUID();

    const ws = new PartySocket({
      host: config.host,
      party: actorName,
      room: instanceId,
      id: this.id,
      // Re-read on every (re)connect so a login/logout is picked up.
      query: () => {
        const token = config.getAuthToken();
        return {
          app_id: config.appId,
          handler: actorName,
          ...(token ? { token } : {}),
          ...(config.functionsVersion ? { fv: config.functionsVersion } : {}),
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
        return;
      }
      const msgType = data && typeof data === "object" ? (data as { type?: unknown }).type : undefined;
      if (msgType === "__pong") return;
      for (const listener of this.listeners) listener(data);
    });

    this.heartbeat = setInterval(() => {
      if (Date.now() - lastMsg > DEAD_MS) {
        bumpAlive(); // avoid a reconnect storm while the new socket comes up
        ws.reconnect();
        return;
      }
      try {
        // The deployed shim echoes __ping → __pong (base44-userapp-bundler
        // shim/actor.ts); without that, an idle room reconnects every DEAD_MS.
        ws.send(JSON.stringify({ type: "__ping" }));
      } catch {
        // not open; the watchdog above will reconnect
      }
    }, PING_MS);
  }

  subscribe(callback: (data: unknown) => void): ActorSubscription {
    this.listeners.add(callback);
    return {
      unsubscribe: () => { this.listeners.delete(callback); },
    };
  }

  send(data: unknown): void {
    this.ws.send(JSON.stringify(data));
  }

  close(): void {
    if (this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
    this.listeners.clear();
    this.ws.close();
    this.onClose();
  }
}

/** Handle for one actor instance: `connect()` opens the socket (idempotent). */
function makeActorRef(
  actorName: string,
  instanceId: string,
  config: ActorsConfig,
  connections: Set<Connection>,
): ActorRef {
  let conn: Connection | null = null;
  return {
    connect(options?: ActorConnectOptions) {
      if (conn) return conn as unknown as ConnectionType;
      const c = new Connection(actorName, instanceId, config, options, () => {
        connections.delete(c);
        if (conn === c) conn = null; // allow a fresh connect() after close
      });
      conn = c;
      connections.add(c);
      return c as unknown as ConnectionType;
    },
  };
}

/**
 * Absolute host for the actor WebSocket. PartySocket needs an absolute host and
 * can't resolve a relative/empty `serverUrl` (same-origin apps use a relative
 * `/api`, so `serverUrl` is often `""`), so fall back to the page origin.
 * PartySocket handles the scheme (https→wss, ws for localhost).
 */
export function resolveActorsHost(serverUrl: string, browserOrigin?: string): string {
  return serverUrl && !serverUrl.startsWith("/") ? serverUrl : browserOrigin ?? serverUrl;
}

export function createActorsModule(config: ActorsConfig) {
  // Live connections this client opened, so client.cleanup() can reclaim any the
  // app forgot to close() (each connection removes itself here on close).
  const connections = new Set<Connection>();
  const module = new Proxy(
    {} as Record<string, (instanceId: string) => ActorRef>,
    {
      get(_, key) {
        // Symbols and `then` resolve to undefined (so the module isn't mistaken
        // for a thenable when awaited); any string key is an actor name.
        if (typeof key !== "string" || key === "then") return undefined;
        return (instanceId: string) =>
          makeActorRef(key, instanceId, config, connections);
      },
    },
  );
  return {
    module,
    closeAll: () => {
      for (const c of [...connections]) c.close();
    },
  };
}
