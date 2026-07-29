import { describe, test, expect, vi, beforeEach } from "vitest";

// Mock PartySocket with a controllable fake so we can drive open/message events
// and assert connect/subscribe/send/close behavior without a real socket.
// vi.hoisted so the class/registry exist before the hoisted vi.mock factory runs.
const { sockets, FakeSocket } = vi.hoisted(() => {
  class FakeSocket {
    opts: any;
    sent: string[] = [];
    closed = false;
    private handlers: Record<string, ((ev: any) => void)[]> = {};
    constructor(opts: any) {
      this.opts = opts;
      sockets.push(this);
    }
    addEventListener(type: string, fn: (ev: any) => void) {
      (this.handlers[type] ??= []).push(fn);
    }
    send(data: string) { this.sent.push(data); }
    close() { this.closed = true; }
    reconnect() {}
    emit(type: string, ev: any) { (this.handlers[type] ?? []).forEach((h) => h(ev)); }
    message(obj: unknown) { this.emit("message", { data: JSON.stringify(obj) }); }
  }
  const sockets: InstanceType<typeof FakeSocket>[] = [];
  return { sockets, FakeSocket };
});

vi.mock("partysocket", () => ({ default: FakeSocket }));

import { createActorsModule, resolveActorsHost } from "../../src/modules/actors.ts";

describe("Actors Module — connection API", () => {
  const config = {
    appId: "app-1",
    getAuthToken: () => "user-tok",
    functionsVersion: undefined,
    host: "https://app.example",
  };

  // The module (Proxy of actor names). closeAll is separate — see its own tests.
  const mod = (c: typeof config = config) => createActorsModule(c).module;

  beforeEach(() => { sockets.length = 0; });

  test("connect() opens exactly one socket with the auth query", () => {
    const conn = mod().GameRoom("room-1").connect({ id: "conn-1" });
    expect(sockets).toHaveLength(1);
    expect(conn.id).toBe("conn-1");
    const q = sockets[0].opts.query();
    expect(q).toMatchObject({ app_id: "app-1", handler: "GameRoom", token: "user-tok" });
    expect(sockets[0].opts.room).toBe("room-1");
    expect(sockets[0].opts.id).toBe("conn-1");
    // the resolved host is handed to PartySocket (which swaps the scheme).
    expect(sockets[0].opts.host).toBe("https://app.example");
  });

  test("connect() is idempotent per handle", () => {
    const ref = mod().GameRoom("r");
    const a = ref.connect();
    const b = ref.connect();
    expect(sockets).toHaveLength(1);
    expect(a).toBe(b);
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

  test("anonymous connect omits the token", () => {
    const conn = mod({ ...config, getAuthToken: () => null }).GameRoom("r").connect();
    expect(conn).toBeDefined();
    expect(sockets[0].opts.query()).not.toHaveProperty("token");
  });

  test("each GameRoom(id) is an independent connection", () => {
    const actors = mod();
    actors.GameRoom("r").connect();
    actors.GameRoom("r").connect();
    expect(sockets).toHaveLength(2);
  });

  test("functionsVersion rides the query as fv when set, omitted when unset", () => {
    mod().GameRoom("r").connect();
    expect(sockets[0].opts.query()).not.toHaveProperty("fv");
    mod({ ...config, functionsVersion: "draft" }).GameRoom("r2").connect();
    expect(sockets[1].opts.query()).toMatchObject({ fv: "draft" });
  });

  test("heartbeat pings periodically and reconnects when the link goes silent", () => {
    vi.useFakeTimers();
    try {
      mod().GameRoom("r").connect();
      const ws = sockets[0];
      const reconnect = vi.spyOn(ws, "reconnect");
      vi.advanceTimersByTime(1000); // one PING_MS tick, still within DEAD_MS
      expect(ws.sent).toContain(JSON.stringify({ type: "__ping" }));
      expect(reconnect).not.toHaveBeenCalled();
      vi.advanceTimersByTime(4000); // no inbound message → exceed DEAD_MS
      expect(reconnect).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  test("module is not thenable (then must not resolve to an actor factory)", () => {
    const actors = mod() as unknown as { then?: unknown };
    expect(actors.then).toBeUndefined();
  });

  test("closeAll() closes every open connection", () => {
    const { module, closeAll } = createActorsModule(config);
    module.GameRoom("a").connect();
    module.GameRoom("b").connect();
    expect(sockets.filter((s) => s.closed)).toHaveLength(0);
    closeAll();
    expect(sockets.every((s) => s.closed)).toBe(true);
  });

  test("closeAll() is safe after an individual close() and closes the rest", () => {
    const { module, closeAll } = createActorsModule(config);
    const a = module.GameRoom("a").connect();
    module.GameRoom("b").connect();
    a.close();
    expect(() => closeAll()).not.toThrow();
    expect(sockets.every((s) => s.closed)).toBe(true);
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
