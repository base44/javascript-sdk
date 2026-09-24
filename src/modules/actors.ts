import { WebSocket as ReconnectingWebSocket } from "partysocket";
import type {
  ActorConnectOptions,
  ActorRef,
  Connection as ConnectionType,
  ActorSubscription,
} from "./actors.types.js";

/** Credentials minted by the platform for one direct actor connection. */
export interface ActorConnectionCredentials {
  /** Direct actor endpoint, already carrying `?_pk=<connectionId>`. */
  websocket_url: string;
  /** Short-lived JWT bound to (app, actor, room, connectionId); appended to
   * the URL as `token=` since browsers can't set WebSocket headers. */
  token: string;
}

interface ActorsConfig {
  appId: string;
  /** Current user access token, if authenticated. Rides the WS query on the
   * proxy-fallback path so the platform proxy can authenticate the connection;
   * anonymous connects omit it. */
  getAuthToken(): string | null | undefined;
  /** Same semantics as function calls: editors with a non-prod version get the
   * draft actor script; everyone else gets the published one. */
  functionsVersion?: string;
  /** Absolute host for the proxy-fallback URL (scheme is swapped to wss, ws
   * for localhost). Resolved by {@link resolveActorsHost}. */
  host: string;
  /** Mints a direct-connect credential for one (actor, room, connection).
   * Called per connection attempt: the token's expiry is checked at upgrade,
   * so every reconnect needs a fresh one. */
  mintConnectionToken(
    actorName: string,
    room: string,
    connectionId: string,
  ): Promise<ActorConnectionCredentials>;
  /** @internal Ops escape hatch: "proxy" never mints (legacy path only),
   * "direct" never falls back. Default "auto". */
  transport?: "auto" | "proxy" | "direct";
  /** Called when a mint fails for a reason other than the expected
   * direct→proxy fallback (which recovers by itself). Wired to the client's
   * `options.onError`. */
  onMintError?: (error: Error) => void;
}

// Heartbeat / half-open detection: the socket only reconnects on a close/error
// event, so ping periodically and force a reconnect if nothing returns in DEAD_MS.
const PING_MS = 1_000;
const DEAD_MS = 3_000;

// Mint responses that mean "direct can't serve this connection, the proxy can":
// 409 = legacy-family actor script, 503 = direct connections not provisioned,
// 422 = no principal (e.g. anonymous outside a browser) or an id/room only the
// proxy's looser validation accepts, 405 = a backend that predates the mint
// endpoint (its actor deploy routes catch the path via `{handler_name:path}`
// but not the POST method, and the real endpoint never 405s a POST). The
// proxy serves migrated actors too, so falling back is always safe.
const PROXY_FALLBACK_STATUSES = new Set([405, 409, 422, 503]);

// Mint responses no retry can fix (bad request / forbidden / not found): the
// connection closes instead of re-minting forever; a fresh connect() re-probes.
// 401 is deliberately absent. The auth token is re-read on every attempt, so a
// login recovers on the next retry. Disjoint from PROXY_FALLBACK_STATUSES.
const TERMINAL_MINT_STATUSES = new Set([400, 403, 404]);

/** The mint's rejection can be anything; a `Base44Error` carries a numeric
 * `.status` (absent for network failures). */
function mintErrorStatus(err: unknown): number | undefined {
  const status =
    err && typeof err === "object"
      ? (err as { status?: unknown }).status
      : undefined;
  return typeof status === "number" ? status : undefined;
}

function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

/**
 * A live connection to an actor instance. Only obtainable from
 * {@link ActorRef.connect}, so `subscribe`/`send` are always valid. The socket
 * exists for this object's whole lifetime.
 */
class Connection {
  private readonly ws: ReconnectingWebSocket;
  private readonly listeners = new Set<(data: unknown) => void>();
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private closed = false;
  /** The client-chosen conn id. It becomes _pk → the actor's conn.id. */
  readonly id: string;

  constructor(
    actorName: string,
    instanceId: string,
    config: ActorsConfig,
    options: ActorConnectOptions | undefined,
    private readonly onClose: () => void,
  ) {
    this.id = options?.id ?? crypto.randomUUID();

    // Direct-first with proxy fallback, decided per connection attempt. Once a
    // mint answers with a fallback status the choice is sticky for this
    // socket's lifetime (a fresh connect() after close() probes direct again,
    // picking up actors migrated in the meantime). Any other mint failure
    // rejects, which ReconnectingWebSocket retries with backoff, except the
    // terminal statuses, which close this connection for good.
    let useProxy = config.transport === "proxy";
    const urlProvider = async (): Promise<string> => {
      if (this.closed) throw new Error("Actor connection is closed");
      if (!useProxy) {
        try {
          const { websocket_url, token } = await config.mintConnectionToken(
            actorName,
            instanceId,
            this.id,
          );
          const sep = websocket_url.includes("?") ? "&" : "?";
          return `${websocket_url}${sep}token=${encodeURIComponent(token)}`;
        } catch (err) {
          const status = mintErrorStatus(err);
          const isFallback =
            config.transport !== "direct" &&
            status !== undefined &&
            PROXY_FALLBACK_STATUSES.has(status);
          if (!isFallback) {
            if (status !== undefined && TERMINAL_MINT_STATUSES.has(status)) {
              // close() before notifying: ws.close() stops the redial the
              // rethrow below would otherwise schedule, and a handler that
              // immediately calls connect() gets a clean new connection.
              this.close();
            }
            // Reported from here because the socket's error event only
            // preserves `err.message`, never `.status`.
            try {
              config.onMintError?.(toError(err));
            } catch {
              // an app handler must not break the dial loop or mask `err`
            }
            throw err;
          }
          useProxy = true;
        }
      }
      // Rebuilt per attempt so a login/logout is picked up on reconnect.
      return buildProxyActorUrl(
        config.host,
        actorName,
        instanceId,
        this.id,
        config.appId,
        config.getAuthToken(),
        config.functionsVersion,
      );
    };

    const ws = new ReconnectingWebSocket(urlProvider);
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
        // Only kick a half-open socket (OPEN but silent). When it isn't open
        // the socket is already redialing with backoff, and reconnect() would
        // reset that backoff into a mint call every DEAD_MS.
        if (ws.readyState === ws.OPEN) ws.reconnect();
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
    // after close() the socket would buffer forever (unbounded enqueue)
    if (this.closed) return;
    this.ws.send(JSON.stringify(data));
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
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
 * The legacy platform-proxy URL, byte-for-byte what PartySocket built before
 * the direct path existed: same scheme swap (including its localhost-needs-a-
 * port quirk), case-preserved party segment, `_pk` first in the query. The
 * `handler` param is load-bearing. The proxy reads it for the actor name.
 */
export function buildProxyActorUrl(
  rawHost: string,
  actorName: string,
  instanceId: string,
  connectionId: string,
  appId: string,
  token: string | null | undefined,
  functionsVersion?: string,
): string {
  let host = rawHost.replace(/^(http|https|ws|wss):\/\//, "");
  if (host.endsWith("/")) host = host.slice(0, -1);
  const insecure =
    host.startsWith("localhost:") ||
    host.startsWith("127.0.0.1:") ||
    host.startsWith("192.168.") ||
    host.startsWith("10.") ||
    (host.startsWith("172.") &&
      host.split(".")[1] >= "16" &&
      host.split(".")[1] <= "31") ||
    host.startsWith("[::ffff:7f00:1]:");
  const query = new URLSearchParams([
    ["_pk", connectionId],
    ["app_id", appId],
    ["handler", actorName],
  ]);
  if (token) query.append("token", token);
  if (functionsVersion) query.append("fv", functionsVersion);
  return `${insecure ? "ws" : "wss"}://${host}/parties/${actorName}/${instanceId}?${query}`;
}

/**
 * Absolute host for the proxy-fallback actor URL. A relative/empty `serverUrl`
 * can't be dialed (same-origin apps use a relative `/api`, so `serverUrl` is
 * often `""`), so fall back to the page origin.
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
