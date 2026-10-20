import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import nock from "nock";

// Mock ReconnectingWebSocket (partysocket's `WebSocket` export) with a
// controllable fake. It records the async URL provider so tests can drive
// connection attempts explicitly — each `await socket.urlProvider()` simulates
// one (re)connect attempt — and lets us emit open/message events without a
// real socket. vi.hoisted so the class/registry exist before the hoisted
// vi.mock factory runs.
const { sockets, FakeSocket } = vi.hoisted(() => {
  class FakeSocket {
    urlProvider: () => Promise<string>;
    sent: string[] = [];
    closed = false;
    readyState = 1; // OPEN, matching ReconnectingWebSocket's constants
    OPEN = 1;
    reconnects = 0;
    private handlers: Record<string, ((ev: any) => void)[]> = {};
    constructor(urlProvider: () => Promise<string>) {
      this.urlProvider = urlProvider;
      sockets.push(this);
    }
    addEventListener(type: string, fn: (ev: any) => void) {
      (this.handlers[type] ??= []).push(fn);
    }
    send(data: string) { this.sent.push(data); }
    close() { this.closed = true; }
    reconnect() { this.reconnects++; }
    emit(type: string, ev: any) { (this.handlers[type] ?? []).forEach((h) => h(ev)); }
    message(obj: unknown) { this.emit("message", { data: JSON.stringify(obj) }); }
  }
  const sockets: InstanceType<typeof FakeSocket>[] = [];
  return { sockets, FakeSocket };
});

vi.mock("partysocket", () => ({ WebSocket: FakeSocket }));

import {
  createActorsModule,
  resolveActorsHost,
  buildProxyActorUrl,
} from "../../src/modules/actors.ts";
import { createClient } from "../../src/index.ts";

const DIRECT_URL = "wss://actors.example/v1/actors/scr_1/rooms/r?_pk=conn-1";

/** A Base44Error-shaped rejection (fallback detection reads `.status`). */
const httpError = (status: number) =>
  Object.assign(new Error(`HTTP ${status}`), { status });

const makeConfig = () => ({
  appId: "app-1",
  getAuthToken: () => "user-tok" as string | null,
  functionsVersion: undefined as string | undefined,
  host: "https://app.example",
  mintConnectionToken: vi.fn(
    async (_actor: string, _room: string, _conn: string) => ({
      websocket_url: DIRECT_URL,
      token: "jwt.abc.def",
    }),
  ),
  transport: undefined as "auto" | "proxy" | "direct" | undefined,
  onMintError: undefined as ((error: Error) => void) | undefined,
});

describe("Actors Module — connection API", () => {
  // The module (Proxy of actor names). closeAll is separate — see its own tests.
  const mod = (c = makeConfig()) => createActorsModule(c).module;

  beforeEach(() => { sockets.length = 0; });

  test("connect() opens exactly one socket that dials the minted direct URL", async () => {
    const config = makeConfig();
    const conn = mod(config).GameRoom("room-1").connect({ id: "conn-1" });
    expect(sockets).toHaveLength(1);
    expect(conn.id).toBe("conn-1");
    await expect(sockets[0].urlProvider()).resolves.toBe(
      `${DIRECT_URL}&token=jwt.abc.def`,
    );
    expect(config.mintConnectionToken).toHaveBeenCalledWith(
      "GameRoom", "room-1", "conn-1",
    );
  });

  test("connect() is idempotent per handle", () => {
    const ref = mod().GameRoom("r");
    const a = ref.connect();
    const b = ref.connect();
    expect(sockets).toHaveLength(1);
    expect(a).toBe(b);
  });

  test("the minted token is percent-encoded onto the URL", async () => {
    const config = makeConfig();
    config.mintConnectionToken.mockResolvedValueOnce({
      websocket_url: DIRECT_URL,
      token: "a b+c",
    });
    mod(config).GameRoom("r").connect();
    await expect(sockets[0].urlProvider()).resolves.toBe(
      `${DIRECT_URL}&token=a%20b%2Bc`,
    );
  });

  test("a websocket_url without a query gets ?token=", async () => {
    const config = makeConfig();
    config.mintConnectionToken.mockResolvedValueOnce({
      websocket_url: "wss://actors.example/v1/actors/scr_1/rooms/r",
      token: "jwt.abc.def",
    });
    mod(config).GameRoom("r").connect();
    await expect(sockets[0].urlProvider()).resolves.toBe(
      "wss://actors.example/v1/actors/scr_1/rooms/r?token=jwt.abc.def",
    );
  });

  test("every connection attempt mints a fresh token", async () => {
    const config = makeConfig();
    config.mintConnectionToken
      .mockResolvedValueOnce({ websocket_url: DIRECT_URL, token: "first" })
      .mockResolvedValueOnce({ websocket_url: DIRECT_URL, token: "second" });
    mod(config).GameRoom("r").connect();
    await expect(sockets[0].urlProvider()).resolves.toBe(`${DIRECT_URL}&token=first`);
    await expect(sockets[0].urlProvider()).resolves.toBe(`${DIRECT_URL}&token=second`);
    expect(config.mintConnectionToken).toHaveBeenCalledTimes(2);
  });

  test("default connection id is a UUID and is what the mint receives", async () => {
    const config = makeConfig();
    const conn = mod(config).GameRoom("r").connect();
    expect(conn.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    await sockets[0].urlProvider();
    expect(config.mintConnectionToken).toHaveBeenCalledWith("GameRoom", "r", conn.id);
  });

  test("multiple listeners all receive; unsubscribe removes only its own", () => {
    const conn = mod().GameRoom("r").connect();
    const a: unknown[] = [], b: unknown[] = [];
    const subA = conn.subscribe((m) => a.push(m));
    conn.subscribe((m) => b.push(m));

    sockets[0].message({ type: "tick", n: 1 });
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);

    subA.unsubscribe();
    sockets[0].message({ type: "tick", n: 2 });
    expect(a).toHaveLength(1); // stopped
    expect(b).toHaveLength(2); // still live
    expect(sockets[0].closed).toBe(false); // socket stays open
  });

  test("__pong platform messages are swallowed", () => {
    const conn = mod().GameRoom("r").connect();
    const got: unknown[] = [];
    conn.subscribe((m) => got.push(m));
    sockets[0].message({ type: "__pong" });
    sockets[0].message({ type: "tick" });
    expect(got).toEqual([{ type: "tick" }]);
  });

  test("send serializes onto the socket", () => {
    const conn = mod().GameRoom("r").connect();
    conn.send({ type: "join", name: "alice" });
    expect(sockets[0].sent).toContain(JSON.stringify({ type: "join", name: "alice" }));
  });

  test("close() tears down socket and all listeners", () => {
    const conn = mod().GameRoom("r").connect();
    const got: unknown[] = [];
    conn.subscribe((m) => got.push(m));
    conn.close();
    expect(sockets[0].closed).toBe(true);
    // a late message reaches nobody (listeners cleared)
    sockets[0].message({ type: "tick" });
    expect(got).toHaveLength(0);
  });

  test("connect() after close() opens a fresh socket with a new id", () => {
    const ref = mod().GameRoom("r");
    const c1 = ref.connect({ id: "c1" });
    expect(sockets).toHaveLength(1);
    c1.close();
    const c2 = ref.connect({ id: "c2" });
    expect(sockets).toHaveLength(2); // a new socket, not the closed one reused
    expect(c2.id).toBe("c2");
  });

  test("each GameRoom(id) is an independent connection", () => {
    const actors = mod();
    actors.GameRoom("r").connect();
    actors.GameRoom("r").connect();
    expect(sockets).toHaveLength(2);
  });

  test("heartbeat pings periodically and reconnects when the link goes silent", () => {
    vi.useFakeTimers();
    try {
      mod().GameRoom("r").connect();
      const ws = sockets[0];
      vi.advanceTimersByTime(1000); // one PING_MS tick, still within DEAD_MS
      expect(ws.sent).toContain(JSON.stringify({ type: "__ping" }));
      expect(ws.reconnects).toBe(0);
      vi.advanceTimersByTime(4000); // no inbound message → exceed DEAD_MS
      expect(ws.reconnects).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  test("heartbeat does not force-reconnect a socket that is already redialing", () => {
    vi.useFakeTimers();
    try {
      mod().GameRoom("r").connect();
      const ws = sockets[0];
      ws.readyState = 0; // CONNECTING: ReconnectingWebSocket is on it
      vi.advanceTimersByTime(4000);
      expect(ws.reconnects).toBe(0);
      ws.readyState = 1; // half-open OPEN socket → the watchdog's job
      vi.advanceTimersByTime(4000);
      expect(ws.reconnects).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  test("module is not thenable (then must not resolve to an actor factory)", () => {
    const actors = mod() as unknown as { then?: unknown };
    expect(actors.then).toBeUndefined();
  });

  test("closeAll() closes every open connection", () => {
    const { module, closeAll } = createActorsModule(makeConfig());
    module.GameRoom("a").connect();
    module.GameRoom("b").connect();
    expect(sockets.filter((s) => s.closed)).toHaveLength(0);
    closeAll();
    expect(sockets.every((s) => s.closed)).toBe(true);
  });

  test("closeAll() is safe after an individual close() and closes the rest", () => {
    const { module, closeAll } = createActorsModule(makeConfig());
    const a = module.GameRoom("a").connect();
    module.GameRoom("b").connect();
    a.close();
    expect(() => closeAll()).not.toThrow();
    expect(sockets.every((s) => s.closed)).toBe(true);
  });
});

describe("Actors Module — proxy fallback", () => {
  const mod = (c = makeConfig()) => createActorsModule(c).module;

  beforeEach(() => { sockets.length = 0; });

  test("mint 409 (legacy actor) falls back to the exact legacy proxy URL", async () => {
    const config = makeConfig();
    config.mintConnectionToken.mockRejectedValueOnce(httpError(409));
    mod(config).GameRoom("r").connect({ id: "conn-1" });
    await expect(sockets[0].urlProvider()).resolves.toBe(
      "wss://app.example/parties/GameRoom/r?_pk=conn-1&app_id=app-1&handler=GameRoom&token=user-tok",
    );
  });

  test.each([503, 422, 405])("mint %i falls back to the proxy", async (status) => {
    const config = makeConfig();
    config.mintConnectionToken.mockRejectedValueOnce(httpError(status));
    mod(config).GameRoom("r").connect({ id: "c" });
    await expect(sockets[0].urlProvider()).resolves.toContain(
      "wss://app.example/parties/GameRoom/r?_pk=c",
    );
  });

  test("fallback is sticky per connection; a fresh connect() probes direct again", async () => {
    const config = makeConfig();
    config.mintConnectionToken.mockRejectedValueOnce(httpError(409));
    const ref = mod(config).GameRoom("r");
    const conn = ref.connect({ id: "c" });
    await sockets[0].urlProvider();
    await sockets[0].urlProvider(); // a reconnect attempt on the same socket
    expect(config.mintConnectionToken).toHaveBeenCalledTimes(1); // no re-probe

    conn.close();
    ref.connect({ id: "c2" });
    await expect(sockets[1].urlProvider()).resolves.toBe(
      `${DIRECT_URL}&token=jwt.abc.def`,
    );
    expect(config.mintConnectionToken).toHaveBeenCalledTimes(2);
  });

  test("non-fallback mint errors reject (socket backoff) and are not sticky", async () => {
    const config = makeConfig();
    config.mintConnectionToken
      .mockRejectedValueOnce(httpError(500))
      .mockRejectedValueOnce(new Error("network down")); // no status at all
    mod(config).GameRoom("r").connect({ id: "c" });
    await expect(sockets[0].urlProvider()).rejects.toThrow("HTTP 500");
    await expect(sockets[0].urlProvider()).rejects.toThrow("network down");
    expect(sockets[0].closed).toBe(false); // retryable ≠ terminal
    // next attempt mints again — and succeeds on the direct path
    await expect(sockets[0].urlProvider()).resolves.toBe(
      `${DIRECT_URL}&token=jwt.abc.def`,
    );
  });

  test("anonymous fallback omits the token; fv rides the query when set", async () => {
    const config = makeConfig();
    config.getAuthToken = () => null;
    config.functionsVersion = "draft";
    config.mintConnectionToken.mockRejectedValueOnce(httpError(409));
    mod(config).GameRoom("r").connect({ id: "c" });
    await expect(sockets[0].urlProvider()).resolves.toBe(
      "wss://app.example/parties/GameRoom/r?_pk=c&app_id=app-1&handler=GameRoom&fv=draft",
    );
  });

  test('transport "proxy" never mints', async () => {
    const config = makeConfig();
    config.transport = "proxy";
    mod(config).GameRoom("r").connect({ id: "c" });
    await expect(sockets[0].urlProvider()).resolves.toContain("/parties/GameRoom/r");
    expect(config.mintConnectionToken).not.toHaveBeenCalled();
  });

  test('transport "direct" disables the fallback', async () => {
    const config = makeConfig();
    config.transport = "direct";
    config.mintConnectionToken.mockRejectedValueOnce(httpError(409));
    mod(config).GameRoom("r").connect({ id: "c" });
    await expect(sockets[0].urlProvider()).rejects.toThrow("HTTP 409");
    expect(sockets[0].closed).toBe(false); // fallback statuses are never terminal
  });
});

describe("Actors Module — terminal mint failures", () => {
  const mod = (c = makeConfig()) => createActorsModule(c).module;

  beforeEach(() => { sockets.length = 0; });

  test.each([400, 403, 404])(
    "mint %i closes the connection permanently",
    async (status) => {
      const config = makeConfig();
      // persistent rejection: proves close() stops the dialing, not mock exhaustion
      config.mintConnectionToken.mockRejectedValue(httpError(status));
      mod(config).GameRoom("r").connect({ id: "c" });
      await expect(sockets[0].urlProvider()).rejects.toThrow(`HTTP ${status}`);
      expect(sockets[0].closed).toBe(true);
    },
  );

  test("no further dials after a terminal failure", async () => {
    const config = makeConfig();
    config.mintConnectionToken.mockRejectedValue(httpError(404));
    mod(config).GameRoom("r").connect({ id: "c" });
    await expect(sockets[0].urlProvider()).rejects.toThrow("HTTP 404");
    // a redial attempt that races the close gets a hard rejection, no mint
    await expect(sockets[0].urlProvider()).rejects.toThrow(
      "Actor connection is closed",
    );
    expect(config.mintConnectionToken).toHaveBeenCalledTimes(1);
  });

  test("the heartbeat is dead after a terminal failure", async () => {
    vi.useFakeTimers();
    try {
      const config = makeConfig();
      config.mintConnectionToken.mockRejectedValue(httpError(403));
      mod(config).GameRoom("r").connect({ id: "c" });
      await expect(sockets[0].urlProvider()).rejects.toThrow("HTTP 403");
      vi.advanceTimersByTime(5000);
      expect(sockets[0].sent).toHaveLength(0);
      expect(sockets[0].reconnects).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  test("the ActorRef is freed: connect() after a terminal failure re-probes direct", async () => {
    const config = makeConfig();
    config.mintConnectionToken.mockRejectedValueOnce(httpError(404));
    const { module, closeAll } = createActorsModule(config);
    const ref = module.GameRoom("r");
    ref.connect({ id: "c1" });
    await expect(sockets[0].urlProvider()).rejects.toThrow("HTTP 404");
    ref.connect({ id: "c2" });
    expect(sockets).toHaveLength(2); // a fresh connection, not the dead one
    await expect(sockets[1].urlProvider()).resolves.toBe(
      `${DIRECT_URL}&token=jwt.abc.def`,
    );
    expect(() => closeAll()).not.toThrow();
  });

  test("401 is not terminal: a later mint with a refreshed token recovers", async () => {
    const config = makeConfig();
    config.mintConnectionToken.mockRejectedValueOnce(httpError(401));
    mod(config).GameRoom("r").connect({ id: "c" });
    await expect(sockets[0].urlProvider()).rejects.toThrow("HTTP 401");
    expect(sockets[0].closed).toBe(false);
    await expect(sockets[0].urlProvider()).resolves.toBe(
      `${DIRECT_URL}&token=jwt.abc.def`,
    );
  });

  test("send() after close is a silent no-op, not an unbounded enqueue", () => {
    const conn = mod().GameRoom("r").connect({ id: "c" });
    conn.close();
    conn.send({ type: "late" });
    expect(sockets[0].sent).toHaveLength(0);
  });
});

describe("Actors Module — mint error reporting", () => {
  const mod = (c = makeConfig()) => createActorsModule(c).module;

  beforeEach(() => { sockets.length = 0; });

  test("a retryable mint error reaches onMintError once, unmodified", async () => {
    const config = makeConfig();
    const err = httpError(500);
    config.onMintError = vi.fn();
    config.mintConnectionToken.mockRejectedValueOnce(err);
    mod(config).GameRoom("r").connect({ id: "c" });
    await expect(sockets[0].urlProvider()).rejects.toThrow("HTTP 500");
    expect(config.onMintError).toHaveBeenCalledTimes(1);
    expect(config.onMintError).toHaveBeenCalledWith(err); // same instance
    expect(sockets[0].closed).toBe(false);
  });

  test("a non-Error rejection is coerced to an Error for the handler", async () => {
    const config = makeConfig();
    config.onMintError = vi.fn();
    config.mintConnectionToken.mockRejectedValueOnce("boom");
    mod(config).GameRoom("r").connect({ id: "c" });
    await expect(sockets[0].urlProvider()).rejects.toBe("boom"); // rethrown raw
    const reported = vi.mocked(config.onMintError).mock.calls[0][0];
    expect(reported).toBeInstanceOf(Error);
    expect(reported.message).toContain("boom");
  });

  test.each([405, 409, 422, 503])(
    "the expected fallback status %i is silent",
    async (status) => {
      const config = makeConfig();
      config.onMintError = vi.fn();
      config.mintConnectionToken.mockRejectedValueOnce(httpError(status));
      mod(config).GameRoom("r").connect({ id: "c" });
      await expect(sockets[0].urlProvider()).resolves.toContain("/parties/");
      expect(config.onMintError).not.toHaveBeenCalled();
    },
  );

  test("a terminal failure is reported and closes the connection", async () => {
    const config = makeConfig();
    config.onMintError = vi.fn();
    config.mintConnectionToken.mockRejectedValueOnce(httpError(403));
    mod(config).GameRoom("r").connect({ id: "c" });
    await expect(sockets[0].urlProvider()).rejects.toThrow("HTTP 403");
    expect(config.onMintError).toHaveBeenCalledTimes(1);
    expect(sockets[0].closed).toBe(true);
  });

  test("a throwing handler does not mask the mint error", async () => {
    const config = makeConfig();
    config.onMintError = vi.fn(() => {
      throw new Error("handler exploded");
    });
    config.mintConnectionToken.mockRejectedValueOnce(httpError(500));
    mod(config).GameRoom("r").connect({ id: "c" });
    await expect(sockets[0].urlProvider()).rejects.toThrow("HTTP 500");
  });

  test('transport "direct": fallback statuses are reported (there is no fallback)', async () => {
    const config = makeConfig();
    config.transport = "direct";
    config.onMintError = vi.fn();
    config.mintConnectionToken.mockRejectedValueOnce(httpError(503));
    mod(config).GameRoom("r").connect({ id: "c" });
    await expect(sockets[0].urlProvider()).rejects.toThrow("HTTP 503");
    expect(config.onMintError).toHaveBeenCalledTimes(1);
  });
});

describe("buildProxyActorUrl", () => {
  const url = (host: string) =>
    buildProxyActorUrl(host, "GameRoom", "room-1", "conn-1", "app-1", "tok");

  test("https host → wss", () => {
    expect(url("https://app.example")).toBe(
      "wss://app.example/parties/GameRoom/room-1?_pk=conn-1&app_id=app-1&handler=GameRoom&token=tok",
    );
  });

  test("bare host → wss; trailing slash stripped", () => {
    expect(url("app.example/")).toMatch(/^wss:\/\/app\.example\/parties\//);
  });

  test("localhost with a port → ws", () => {
    expect(url("http://localhost:3000")).toMatch(/^ws:\/\/localhost:3000\//);
    expect(url("localhost:1999")).toMatch(/^ws:\/\/localhost:1999\//);
  });

  test("private-range hosts → ws", () => {
    expect(url("10.0.0.5:8080")).toMatch(/^ws:\/\//);
    expect(url("172.20.1.2")).toMatch(/^ws:\/\//);
    expect(url("192.168.1.7")).toMatch(/^ws:\/\//);
  });

  test("party segment is case-preserved and _pk comes first", () => {
    const u = new URL(url("https://app.example"));
    expect(u.pathname).toBe("/parties/GameRoom/room-1");
    expect([...u.searchParams.keys()][0]).toBe("_pk");
  });

  test("token and fv are omitted when absent", () => {
    const u = buildProxyActorUrl("https://h.example", "A", "r", "c", "app", null);
    expect(u).toBe("wss://h.example/parties/A/r?_pk=c&app_id=app&handler=A");
  });
});

describe("resolveActorsHost", () => {
  test("absolute serverUrl is used as-is", () => {
    expect(resolveActorsHost("https://api.example", "https://tab.example")).toBe(
      "https://api.example",
    );
  });

  test("empty serverUrl falls back to the browser origin", () => {
    expect(resolveActorsHost("", "https://tab.example")).toBe("https://tab.example");
  });

  test("relative serverUrl (/api) falls back to the browser origin", () => {
    expect(resolveActorsHost("/api", "https://tab.example")).toBe("https://tab.example");
  });

  test("no origin available (non-browser) returns the serverUrl unchanged", () => {
    expect(resolveActorsHost("", undefined)).toBe("");
  });
});

describe("Actors Module — client wiring", () => {
  const serverUrl = "https://base44.app";
  const appId = "app-1";

  beforeEach(() => { sockets.length = 0; });
  afterEach(() => {
    nock.cleanAll();
    vi.unstubAllGlobals();
  });

  test("mints via POST /connection-token with app, auth, and version headers", async () => {
    const scope = nock(serverUrl, {
      reqheaders: {
        "x-app-id": appId,
        authorization: "Bearer tok",
        "base44-functions-version": "draft",
      },
    })
      .post(`/api/apps/${appId}/actors/PongGame/connection-token`, {
        room: "r1",
        connection_id: "c1",
      })
      .reply(200, {
        websocket_url: "wss://actors.example/v1/actors/scr_1/rooms/r1?_pk=c1",
        token: "jwt.min.ted",
        expires_at: "2026-01-01T00:00:00Z",
        mode: "preview",
      });

    const base44 = createClient({
      serverUrl,
      appId,
      token: "tok",
      functionsVersion: "draft",
    });
    base44.actors.PongGame("r1").connect({ id: "c1" });
    await expect(sockets[0].urlProvider()).resolves.toBe(
      "wss://actors.example/v1/actors/scr_1/rooms/r1?_pk=c1&token=jwt.min.ted",
    );
    expect(scope.isDone()).toBe(true);
    base44.cleanup();
  });

  test("a 409 mint reply falls back to the legacy proxy URL without calling onError", async () => {
    nock(serverUrl)
      .post(`/api/apps/${appId}/actors/PongGame/connection-token`)
      .reply(409, { message: "Actor must be migrated before connecting directly" });

    const onError = vi.fn();
    const base44 = createClient({ serverUrl, appId, token: "tok", options: { onError } });
    base44.actors.PongGame("r1").connect({ id: "c1" });
    await expect(sockets[0].urlProvider()).resolves.toBe(
      "wss://base44.app/parties/PongGame/r1?_pk=c1&app_id=app-1&handler=PongGame&token=tok",
    );
    // the fallback handshake is expected — the app's error handler stays quiet
    expect(onError).not.toHaveBeenCalled();
    base44.cleanup();
  });

  test("a 405 mint reply (backend without the endpoint) falls back to the proxy", async () => {
    // What a pre-direct backend actually answers: its actor deploy routes
    // match the path via `{handler_name:path}` but not the POST method.
    nock(serverUrl)
      .post(`/api/apps/${appId}/actors/PongGame/connection-token`)
      .reply(405, {
        error_type: "HTTPException",
        message: "Method Not Allowed",
        detail: "Method Not Allowed",
      });

    const onError = vi.fn();
    const base44 = createClient({ serverUrl, appId, token: "tok", options: { onError } });
    base44.actors.PongGame("r1").connect({ id: "c1" });
    await expect(sockets[0].urlProvider()).resolves.toBe(
      "wss://base44.app/parties/PongGame/r1?_pk=c1&app_id=app-1&handler=PongGame&token=tok",
    );
    expect(onError).not.toHaveBeenCalled();
    base44.cleanup();
  });

  test("a non-fallback mint failure reaches the client's onError as a Base44Error", async () => {
    nock(serverUrl)
      .post(`/api/apps/${appId}/actors/PongGame/connection-token`)
      .reply(500, { message: "mint exploded" });

    const onError = vi.fn();
    const base44 = createClient({ serverUrl, appId, token: "tok", options: { onError } });
    base44.actors.PongGame("r1").connect({ id: "c1" });
    await expect(sockets[0].urlProvider()).rejects.toThrow("mint exploded");
    expect(onError).toHaveBeenCalledTimes(1);
    const reported = onError.mock.calls[0][0];
    expect(reported).toBeInstanceOf(Error);
    expect(reported.status).toBe(500);
    base44.cleanup();
  });

  test("unauthenticated React Native mints carry a stable anonymous id", async () => {
    // React Native: `window` exists without `location`, no `localStorage`.
    // (Inert listener stubs keep the analytics module constructible here; on
    // real RN it is disabled wholesale.)
    vi.stubGlobal("window", {
      addEventListener: () => {},
      removeEventListener: () => {},
    });
    vi.stubGlobal("document", undefined);
    vi.stubGlobal("localStorage", undefined);

    const seen: unknown[] = [];
    nock(serverUrl)
      .post(`/api/apps/${appId}/actors/PongGame/connection-token`)
      .times(2)
      .reply(function () {
        seen.push(this.req.headers["x-base44-anonymous-id"]);
        return [
          200,
          {
            websocket_url: "wss://actors.example/v1/actors/scr_1/rooms/r1?_pk=c1",
            token: "jwt.min.ted",
          },
        ];
      });

    const base44 = createClient({ serverUrl, appId });
    base44.actors.PongGame("r1").connect({ id: "c1" });
    await sockets[0].urlProvider();
    await sockets[0].urlProvider(); // a reconnect mints again
    expect(seen).toHaveLength(2);
    expect(typeof seen[0]).toBe("string");
    expect(seen[0]).toBeTruthy();
    expect(seen[0]).toBe(seen[1]); // stable across reconnects, not a fresh id per call
    base44.cleanup();
  });

  test("authenticated React Native mints send Authorization, not the anonymous id", async () => {
    vi.stubGlobal("window", {
      addEventListener: () => {},
      removeEventListener: () => {},
    });
    vi.stubGlobal("document", undefined);
    vi.stubGlobal("localStorage", undefined);

    const scope = nock(serverUrl, {
      reqheaders: { authorization: "Bearer tok" },
      badheaders: ["x-base44-anonymous-id"],
    })
      .post(`/api/apps/${appId}/actors/PongGame/connection-token`)
      .reply(200, {
        websocket_url: "wss://actors.example/v1/actors/scr_1/rooms/r1?_pk=c1",
        token: "jwt.min.ted",
      });

    const base44 = createClient({ serverUrl, appId, token: "tok" });
    base44.actors.PongGame("r1").connect({ id: "c1" });
    await expect(sockets[0].urlProvider()).resolves.toContain("token=jwt.min.ted");
    expect(scope.isDone()).toBe(true);
    base44.cleanup();
  });

  test('actorsTransport: "proxy" dials the proxy without minting', async () => {
    // no nock intercept: any HTTP call would throw
    const base44 = createClient({
      serverUrl,
      appId,
      token: "tok",
      options: { actorsTransport: "proxy" },
    });
    base44.actors.PongGame("r1").connect({ id: "c1" });
    await expect(sockets[0].urlProvider()).resolves.toBe(
      "wss://base44.app/parties/PongGame/r1?_pk=c1&app_id=app-1&handler=PongGame&token=tok",
    );
    base44.cleanup();
  });
});
