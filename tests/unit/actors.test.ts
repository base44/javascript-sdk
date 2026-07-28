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

import { createActorsModule, resolveActorsWsUrl } from "../../src/modules/actors.ts";

describe("Actors Module — room handle", () => {
  const config = {
    appId: "app-1",
    getAuthToken: () => "user-tok",
    functionsVersion: undefined,
    actorsWsUrl: "wss://disp.example",
  };

  // The module (Proxy of actor names). closeAll is separate — see its own tests.
  const mod = (c: typeof config = config) => createActorsModule(c).module;

  beforeEach(() => { sockets.length = 0; });

  test("connect() opens exactly one socket with the auth query", () => {
    const actors = mod();
    const room = actors.GameRoom("room-1").connect({ id: "conn-1" });
    expect(sockets).toHaveLength(1);
    expect(room.id).toBe("conn-1");
    const q = sockets[0].opts.query();
    expect(q).toMatchObject({ app_id: "app-1", handler: "GameRoom", token: "user-tok" });
    expect(sockets[0].opts.room).toBe("room-1");
    expect(sockets[0].opts.id).toBe("conn-1");
  });

  test("connect() is idempotent", () => {
    const room = mod().GameRoom("r").connect();
    room.connect();
    expect(sockets).toHaveLength(1);
  });

  test("subscribe/send/id throw before connect()", () => {
    const room = mod().GameRoom("r");
    expect(() => room.subscribe(() => {})).toThrow(/connect\(\)/);
    expect(() => room.send({})).toThrow(/connect\(\)/);
    expect(() => room.id).toThrow(/connect\(\)/);
  });

  test("multiple listeners all receive; unsubscribe removes only its own", () => {
    const room = mod().GameRoom("r").connect();
    const a: unknown[] = [], b: unknown[] = [];
    const subA = room.subscribe((m) => a.push(m));
    room.subscribe((m) => b.push(m));

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
    const room = mod().GameRoom("r").connect();
    const got: unknown[] = [];
    room.subscribe((m) => got.push(m));
    sockets[0].message({ type: "__pong" });
    sockets[0].message({ type: "tick" });
    expect(got).toEqual([{ type: "tick" }]);
  });

  test("send serializes onto the socket", () => {
    const room = mod().GameRoom("r").connect();
    room.send({ type: "join", name: "alice" });
    expect(sockets[0].sent).toContain(JSON.stringify({ type: "join", name: "alice" }));
  });

  test("close() tears down socket and all listeners", () => {
    const room = mod().GameRoom("r").connect();
    const got: unknown[] = [];
    room.subscribe((m) => got.push(m));
    room.close();
    expect(sockets[0].closed).toBe(true);
    // a late message reaches nobody (listeners cleared)
    sockets[0].message({ type: "tick" });
    expect(got).toHaveLength(0);
  });

  test("close() clears the id (only valid while connected)", () => {
    const room = mod().GameRoom("r").connect({ id: "c1" });
    expect(room.id).toBe("c1");
    room.close();
    expect(() => room.id).toThrow(/connect\(\)/);
  });

  test("anonymous connect omits the token", () => {
    const room = mod({ ...config, getAuthToken: () => null }).GameRoom("r").connect();
    expect(room).toBeDefined();
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

  test("module is not thenable (then must not resolve to a room factory)", () => {
    const actors = mod() as unknown as { then?: unknown };
    expect(actors.then).toBeUndefined();
  });

  test("closeAll() tears down every open room", () => {
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

describe("resolveActorsWsUrl", () => {
  test("explicit actorsWsUrl wins, trailing slash stripped", () => {
    expect(
      resolveActorsWsUrl({ actorsWsUrl: "wss://edge.example/", serverUrl: "https://api" }),
    ).toBe("wss://edge.example");
  });

  test("appBaseUrl over serverUrl; https → wss", () => {
    expect(
      resolveActorsWsUrl({ appBaseUrl: "https://app.example/", serverUrl: "https://api.example" }),
    ).toBe("wss://app.example");
  });

  test("http → ws", () => {
    expect(
      resolveActorsWsUrl({ appBaseUrl: "http://localhost:3000", serverUrl: "https://api" }),
    ).toBe("ws://localhost:3000");
  });

  test("browserOrigin used when no appBaseUrl", () => {
    expect(
      resolveActorsWsUrl({ browserOrigin: "https://tab.example", serverUrl: "https://api.example" }),
    ).toBe("wss://tab.example");
  });

  test("falls back to serverUrl (Node/SSR, no origin)", () => {
    expect(resolveActorsWsUrl({ serverUrl: "https://api.example" })).toBe("wss://api.example");
  });
});
