import { isAxiosError, type AxiosInstance } from "axios";
import PartySocket, { WebSocket as ReconnectingWebSocket } from "partysocket";
import { getAnalyticsSessionId } from "./analytics.js";
import { generateUuid } from "../utils/common.js";
import { ActorConnectionError } from "./actors.error.js";
import type {
  ActorConnectOptions,
  ActorRef,
  Connection as ConnectionType,
  ActorSubscription,
} from "./actors.types.js";

interface ActorsConfig {
  appId: string;
  connectionClient: AxiosInstance;
  onError?: (error: ActorConnectionError) => void;
  /** Current user access token, if authenticated. */
  getAuthToken(): string | null | undefined;
  /** Same semantics as function calls: editors with a non-prod version get the
   * draft actor script; everyone else gets the published one. */
  functionsVersion?: string;
  /** Absolute host used when a legacy Actor falls back to the Apper proxy. */
  host: string;
}

interface ActorConnectionTokenResponse {
  websocket_url: string;
  token: string;
}

// Both mirror the Actor Worker dispatcher's own validation (see
// workers/base44-dispatcher/src/actor-routing.ts) so a request it would reject
// fails here instead. Rejection happens on the WebSocket *upgrade*, which
// reaches the browser as an opaque 1006 with no status to act on, so failing
// fast client-side is the only way to report the real reason.
const CONNECTION_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const INSTANCE_ID_RE = /^[\x20-\x2e\x30-\x7e]{1,256}$/;

const RETRYABLE_BOOTSTRAP_STATUSES = new Set([401, 408, 425, 429]);

// Heartbeat / half-open detection: PartySocket only reconnects on a close/error
// event, so ping periodically and force a reconnect if nothing returns in DEAD_MS.
const PING_MS = 1_000;
const DEAD_MS = 3_000;
// While heartbeat reconnects keep coming back silent, the dead window doubles up
// to this cap. Every heartbeat re-dial buys a connection-token POST against a
// per-app rate limit, so a link that reopens but never delivers a frame must not
// hold the DEAD_MS cadence forever. Any inbound frame resets the window.
const MAX_DEAD_MS = 60_000;

// PartySocket retries forever (`maxRetries: Infinity`) and every attempt costs a
// connection-token POST, so a connection that can never be admitted needs a
// bound. Close codes cannot provide one: the dispatcher refuses the upgrade over
// HTTP (opaque 1006 on the client), and 1000 arrives both from
// `conn.reject(1000, ...)` and from a graceful worker shutdown. Counting
// attempts measures "retrying is not working" directly instead.
//
// ~25-40s under PartySocket's 1-5s base delay x1.3 growth (10s cap): long enough
// to ride out a deploy, short enough to stop a rejection loop quickly.
const MAX_CONSECUTIVE_FAILURES = 6;
// A socket that holds this long proves retrying works, so the budget resets.
// Matches PartySocket's own `minUptime`.
const STABLE_MS = 5_000;

/**
 * A connection to an actor instance. Only obtainable from {@link ActorRef.connect}.
 */
class Connection {
  private readonly ws: ReconnectingWebSocket;
  private readonly listeners = new Set<(data: unknown) => void>();
  private readonly errorListeners = new Set<(error: ActorConnectionError) => void>();
  private readonly globalOnError?: (error: ActorConnectionError) => void;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private isClosed = false;
  private closedError: ActorConnectionError | null = null;
  /** Attempts since the last socket that stayed up for {@link STABLE_MS}. */
  private consecutiveFailures = 0;
  private stabilityTimer: ReturnType<typeof setTimeout> | null = null;
  /** The client-chosen conn id — becomes _pk → the actor's conn.id. */
  readonly id: string;

  constructor(
    private readonly actorName: string,
    private readonly instanceId: string,
    config: ActorsConfig,
    options: ActorConnectOptions | undefined,
    getAnonymousId: () => string,
    private readonly onClose: () => void,
  ) {
    this.id = resolveConnectionId(options?.id);
    this.globalOnError = config.onError;
    this.addErrorListener(options?.onError);

    let bootstrapErrorAwaitingSocketEvent = false;

    const ws = new ReconnectingWebSocket(
      async () => {
        if (this.closedError) throw this.closedError;
        bootstrapErrorAwaitingSocketEvent = false;
        try {
          return await resolveActorWebSocketUrl(
            actorName,
            instanceId,
            this.id,
            getAnonymousId,
            config,
          );
        } catch (error) {
          const status = isAxiosError(error) ? error.response?.status : undefined;
          const connectionError = this.createError(error, status);
          bootstrapErrorAwaitingSocketEvent = true;
          if (isTerminalBootstrapError(error)) {
            this.reportError(connectionError, true);
          } else if (status === undefined) {
            // The request never reached the server (offline, DNS, aborted), so
            // it consumes nothing and will succeed once connectivity returns.
            // Charging the budget here would kill the connection over a tunnel.
            this.reportError(connectionError);
          } else {
            this.reportAttemptFailure(connectionError);
          }
          throw connectionError;
        }
      },
      undefined,
      { startClosed: true },
    );
    this.ws = ws;

    let lastActivityAt: number | null = null;
    let socketOpened = false;
    let reconnectingForHeartbeat = false;
    /** Watchdog trips with no inbound frame since: gates the one-per-outage
     *  silence report and widens the dead window. Reset by any message. */
    let silentReconnects = 0;
    let closeSequence = 0;
    let suppressedCloseSequence = 0;
    const markAlive = () => { lastActivityAt = Date.now(); };
    const markDisconnected = () => { lastActivityAt = null; };
    ws.addEventListener("open", () => {
      socketOpened = true;
      markAlive();
      this.armStability();
    });
    ws.addEventListener("close", (event) => {
      const closedSocketWasOpen = socketOpened;
      socketOpened = false;
      markDisconnected();
      this.clearStability();
      const currentCloseSequence = ++closeSequence;
      // A heartbeat-driven reconnect is not a failed attempt: a legacy Actor
      // without the __pong shim reconnects every DEAD_MS by design, so charging
      // the budget for those would tear down every legacy connection.
      if (this.isClosed || reconnectingForHeartbeat || !closedSocketWasOpen) return;

      // PartySocket emits a synthetic close before its error event. Defer so
      // that transport errors are reported once with their real cause.
      queueMicrotask(() => {
        if (this.isClosed || suppressedCloseSequence === currentCloseSequence) return;
        const reason = event.reason
          ? `WebSocket closed with code ${event.code}: ${event.reason}`
          : `WebSocket closed with code ${event.code}`;
        const connectionError = this.createError(
          new Error(reason),
          undefined,
          event.code,
          event.reason || undefined,
        );
        if (isTerminalSocketCloseCode(event.code)) {
          this.reportError(connectionError, true);
        } else {
          this.reportAttemptFailure(connectionError);
        }
      });
    });
    ws.addEventListener("error", (event) => {
      markDisconnected();
      suppressedCloseSequence = closeSequence;
      if (this.isClosed) return;
      if (bootstrapErrorAwaitingSocketEvent) {
        bootstrapErrorAwaitingSocketEvent = false;
        return;
      }
      const cause = event.error instanceof Error
        ? event.error
        : new Error(event.message || "Actor WebSocket error");
      // Also the only signal for a refused *upgrade* (bad token, unknown or
      // throwing Actor): the dispatcher answers over HTTP, the socket never
      // opens, and the close listener above skips it — so the budget applied
      // here is what stops a permanently unroutable connection.
      this.reportAttemptFailure(this.createError(cause));
    });
    ws.addEventListener("message", (ev) => {
      markAlive();
      silentReconnects = 0;
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
      if (lastActivityAt === null || ws.readyState !== ws.OPEN) return;
      const deadMs = Math.min(DEAD_MS * 2 ** silentReconnects, MAX_DEAD_MS);
      if (Date.now() - lastActivityAt > deadMs) {
        lastActivityAt = null;
        // One report per silent stretch: reopen → silence → re-dial cycles are
        // one outage to the app, not a new failure every window.
        if (silentReconnects === 0) {
          this.reportError(this.createError(new Error("Actor WebSocket stopped responding")));
        }
        silentReconnects += 1;
        reconnectingForHeartbeat = true;
        try {
          ws.reconnect(1000, "heartbeat timeout");
        } finally {
          reconnectingForHeartbeat = false;
        }
        return;
      }
      try {
        // The deployed shim echoes __ping → __pong (base44-userapp-bundler
        // shim/actor.ts); without that, an idle room reconnects on a widening
        // interval (DEAD_MS up to MAX_DEAD_MS).
        ws.send(JSON.stringify({ type: "__ping" }));
      } catch {
        // The next watchdog tick will reconnect if the link stays half-open.
      }
    }, PING_MS);
    ws.reconnect();
  }

  subscribe(callback: (data: unknown) => void): ActorSubscription {
    this.assertNotClosed();
    this.listeners.add(callback);
    return {
      unsubscribe: () => { this.listeners.delete(callback); },
    };
  }

  send(data: unknown): void {
    this.assertNotClosed();
    this.ws.send(JSON.stringify(data));
  }

  get closed(): boolean {
    return this.isClosed;
  }

  addErrorListener(listener?: (error: ActorConnectionError) => void): ActorSubscription {
    if (!listener) return { unsubscribe: () => {} };
    this.assertNotClosed();
    this.errorListeners.add(listener);
    return {
      unsubscribe: () => { this.errorListeners.delete(listener); },
    };
  }

  close(): void {
    this.teardown(this.createError(new Error("Connection is closed")));
  }

  private assertNotClosed(): void {
    if (!this.closedError) return;
    throw this.createError(
      this.closedError.cause,
      this.closedError.status,
      this.closedError.closeCode,
      this.closedError.closeReason,
    );
  }

  private createError(
    cause: unknown,
    status?: number,
    closeCode?: number,
    closeReason?: string,
  ): ActorConnectionError {
    return new ActorConnectionError(
      this.actorName,
      this.instanceId,
      this.id,
      cause,
      status,
      closeCode,
      closeReason,
    );
  }

  private reportError(error: ActorConnectionError, terminal = false): void {
    const handlers = new Set(this.errorListeners);
    if (this.globalOnError) handlers.add(this.globalOnError);
    if (terminal) this.teardown(error);
    for (const handler of handlers) {
      try {
        handler(error);
      } catch {
        // Error observers must not replace the failure PartySocket receives.
      }
    }
  }

  /**
   * Report a failed connection attempt, and give up once the budget is spent.
   * This is the only bound on retries for failures a close code cannot classify
   * — see {@link MAX_CONSECUTIVE_FAILURES}.
   */
  private reportAttemptFailure(error: ActorConnectionError): void {
    this.clearStability();
    const exhausted = ++this.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES;
    this.reportError(error, exhausted);
  }

  private armStability(): void {
    this.clearStability();
    this.stabilityTimer = setTimeout(() => {
      this.stabilityTimer = null;
      this.consecutiveFailures = 0;
    }, STABLE_MS);
  }

  private clearStability(): void {
    if (this.stabilityTimer) {
      clearTimeout(this.stabilityTimer);
      this.stabilityTimer = null;
    }
  }

  private teardown(error: ActorConnectionError): void {
    if (this.isClosed) return;
    this.isClosed = true;
    this.closedError = error;
    if (this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
    this.listeners.clear();
    this.errorListeners.clear();
    this.clearStability();
    this.ws.close();
    this.onClose();
  }
}

/**
 * Whether a close code proves a retry can never succeed.
 *
 * Only 1000 and 3000-4999 can reach us as a deliberate server-side choice — the
 * WebSocket API rejects every other code passed to `close()`, so the rest are
 * generated by the transport (1006 on a dropped link or a refused upgrade, 1001
 * on shutdown, 1011 on a server error) and are all worth retrying.
 *
 * Of those two, only 3000-4999 carries app intent: `conn.reject(code, reason)`
 * picks it, and the Actor's decision will not differ on the next attempt. 1000
 * is ambiguous — `reject(1000, ...)` and a graceful worker shutdown are
 * indistinguishable on the wire — so it is left to the attempt budget, which
 * reconnects through a deploy but still gives up on a rejection loop.
 */
function isTerminalSocketCloseCode(code: number): boolean {
  return code >= 3000 && code <= 4999;
}

function isTerminalBootstrapError(error: unknown): boolean {
  if (!isAxiosError(error)) return true;
  const status = error.response?.status;
  return status !== undefined
    && status >= 400
    && status < 500
    && !RETRYABLE_BOOTSTRAP_STATUSES.has(status);
}

/** Handle for one actor instance: `connect()` opens the socket (idempotent). */
function makeActorRef(
  actorName: string,
  instanceId: string,
  config: ActorsConfig,
  getAnonymousId: () => string,
  connections: Set<Connection>,
): ActorRef {
  assertValidInstanceId(instanceId);
  let conn: Connection | null = null;
  return {
    connect(options?: ActorConnectOptions) {
      // Before the conflict check below, so a malformed id reports as malformed
      // rather than as a mismatch against the live connection's (always valid) id.
      if (options?.id !== undefined) assertValidConnectionId(options.id);
      if (conn) {
        if (options?.id !== undefined && options.id !== conn.id) {
          throw new Error(
            `Actor connection is already open with id "${conn.id}"; cannot reuse it with id "${options.id}"`,
          );
        }
        if (options?.onError) {
          // Registering here would be unremovable: the subscription that
          // addErrorListener returns has nowhere to go, so a handler recreated
          // per render would accumulate for the connection's whole life.
          throw new Error(
            "Actor connection is already open; use connection.addErrorListener() to add an error handler",
          );
        }
        return conn as unknown as ConnectionType;
      }
      const c = new Connection(actorName, instanceId, config, options, getAnonymousId, () => {
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
 * Absolute host for the legacy Actor WebSocket. A relative/empty `serverUrl`
 * cannot identify the Apper proxy, so same-origin apps fall back to the page
 * origin.
 */
export function resolveActorsHost(serverUrl: string, browserOrigin?: string): string {
  return serverUrl && !serverUrl.startsWith("/") ? serverUrl : browserOrigin ?? serverUrl;
}

function assertValidConnectionId(id: string): void {
  if (!CONNECTION_ID_RE.test(id)) {
    throw new Error(
      "Actor connection id must be 1-64 letters, numbers, underscores, or hyphens",
    );
  }
}

function assertValidInstanceId(instanceId: string): void {
  if (!INSTANCE_ID_RE.test(instanceId)) {
    throw new Error(
      `Actor instance id "${instanceId}" must be 1-256 printable ASCII characters and cannot contain "/"`,
    );
  }
}

function resolveConnectionId(id?: string): string {
  if (id !== undefined) {
    assertValidConnectionId(id);
    return id;
  }
  return globalThis.crypto?.randomUUID?.() ?? generateUuid();
}

function legacyActorWebSocketUrl(
  actorName: string,
  instanceId: string,
  connectionId: string,
  authToken: string | null | undefined,
  config: ActorsConfig,
): string {
  const url = new URL(new PartySocket({
    host: config.host,
    party: actorName,
    room: instanceId,
    id: connectionId,
    startClosed: true,
  }).roomUrl);
  url.searchParams.set("_pk", connectionId);
  url.searchParams.set("app_id", config.appId);
  url.searchParams.set("handler", actorName);
  if (authToken) url.searchParams.set("token", authToken);
  if (config.functionsVersion) url.searchParams.set("fv", config.functionsVersion);
  return url.toString();
}

async function resolveActorWebSocketUrl(
  actorName: string,
  instanceId: string,
  connectionId: string,
  getAnonymousId: () => string,
  config: ActorsConfig,
): Promise<string> {
  const authToken = config.getAuthToken();
  const anonymousId = authToken ? null : getAnonymousId();
  const response = await config.connectionClient.post<ActorConnectionTokenResponse>(
    `/apps/${encodeURIComponent(config.appId)}/actors/${encodeURIComponent(actorName)}/connection-token`,
    { room: instanceId, connection_id: connectionId },
    {
      headers: {
        Authorization: authToken ? `Bearer ${authToken}` : null,
        "X-Base44-Anonymous-Id": anonymousId,
        ...(config.functionsVersion
          ? { "Base44-Functions-Version": config.functionsVersion }
          : {}),
      },
      validateStatus: (status) =>
        (status >= 200 && status < 300) || status === 409,
    },
  );

  if (response.status === 409) {
    return legacyActorWebSocketUrl(
      actorName,
      instanceId,
      connectionId,
      authToken,
      config,
    );
  }

  const websocketUrl = response.data?.websocket_url;
  const token = response.data?.token;
  if (typeof websocketUrl !== "string" || !websocketUrl || typeof token !== "string" || !token) {
    throw new Error("Invalid Actor connection response");
  }
  const url = new URL(websocketUrl);
  if (url.protocol !== "ws:" && url.protocol !== "wss:") {
    throw new Error("Invalid Actor WebSocket URL");
  }
  url.searchParams.set("_pk", connectionId);
  url.searchParams.set("token", token);
  return url.toString();
}

export function createActorsModule(config: ActorsConfig) {
  // Live connections this client opened, so client.cleanup() can reclaim any the
  // app forgot to close() (each connection removes itself here on close).
  const connections = new Set<Connection>();
  let anonymousId: string | undefined;
  const getAnonymousId = () => anonymousId ??= getAnalyticsSessionId();
  const module = new Proxy(
    {} as Record<string, (instanceId: string) => ActorRef>,
    {
      get(_, key) {
        // Symbols and `then` resolve to undefined (so the module isn't mistaken
        // for a thenable when awaited); any string key is an actor name.
        if (typeof key !== "string" || key === "then") return undefined;
        return (instanceId: string) =>
          makeActorRef(key, instanceId, config, getAnonymousId, connections);
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
