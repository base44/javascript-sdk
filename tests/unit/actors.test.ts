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

import { createActorsModule } from "../../src/modules/actors.ts";

describe("Actors Module — room handle", () => {
  const config = {
    appId: "app-1",
    getAuthToken: () => "user-tok",
    functionsVersion: undefined,
    actorsWsUrl: "wss://disp.example",
  };

  beforeEach(() => { sockets.length = 0; });

  test("connect() opens exactly one socket with the auth query", () => {
    const actors = createActorsModule(config);
    const room = actors.GameRoom("room-1").connect({ id: "conn-1" });
    expect(sockets).toHaveLength(1);
    expect(room.id).toBe("conn-1");
    const q = sockets[0].opts.query();
    expect(q).toMatchObject({ app_id: "app-1", handler: "GameRoom", token: "user-tok" });
    expect(sockets[0].opts.room).toBe("room-1");
    expect(sockets[0].opts.id).toBe("conn-1");
  });

  test("connect() is idempotent", () => {
    const room = createActorsModule(config).GameRoom("r").connect();
    room.connect();
    expect(sockets).toHaveLength(1);
  });

  test("subscribe/send/id throw before connect()", () => {
    const room = createActorsModule(config).GameRoom("r");
    expect(() => room.subscribe(() => {})).toThrow(/connect\(\)/);
    expect(() => room.send({})).toThrow(/connect\(\)/);
    expect(() => room.id).toThrow(/connect\(\)/);
  });

  test("multiple listeners all receive; unsubscribe removes only its own", () => {
    const room = createActorsModule(config).GameRoom("r").connect();
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
    const room = createActorsModule(config).GameRoom("r").connect();
    const got: unknown[] = [];
    room.subscribe((m) => got.push(m));
    sockets[0].message({ type: "__pong" });
    sockets[0].message({ type: "tick" });
    expect(got).toEqual([{ type: "tick" }]);
  });

  test("send serializes onto the socket", () => {
    const room = createActorsModule(config).GameRoom("r").connect();
    room.send({ type: "join", name: "alice" });
    expect(sockets[0].sent).toContain(JSON.stringify({ type: "join", name: "alice" }));
  });

  test("close() tears down socket and all listeners", () => {
    const room = createActorsModule(config).GameRoom("r").connect();
    const got: unknown[] = [];
    room.subscribe((m) => got.push(m));
    room.close();
    expect(sockets[0].closed).toBe(true);
    // a late message reaches nobody (listeners cleared)
    sockets[0].message({ type: "tick" });
    expect(got).toHaveLength(0);
  });

  test("anonymous connect omits the token", () => {
    const room = createActorsModule({ ...config, getAuthToken: () => null }).GameRoom("r").connect();
    expect(room).toBeDefined();
    expect(sockets[0].opts.query()).not.toHaveProperty("token");
  });

  test("each GameRoom(id) is an independent connection", () => {
    const actors = createActorsModule(config);
    actors.GameRoom("r").connect();
    actors.GameRoom("r").connect();
    expect(sockets).toHaveLength(2);
  });

  test("closeAll() tears down every open room", () => {
    const actors = createActorsModule(config);
    actors.GameRoom("a").connect();
    actors.GameRoom("b").connect();
    expect(sockets.filter((s) => s.closed)).toHaveLength(0);
    actors.closeAll();
    expect(sockets.every((s) => s.closed)).toBe(true);
  });

  test("closeAll() is safe after an individual close() and closes the rest", () => {
    const actors = createActorsModule(config);
    const a = actors.GameRoom("a").connect();
    actors.GameRoom("b").connect();
    a.close();
    expect(() => actors.closeAll()).not.toThrow();
    expect(sockets.every((s) => s.closed)).toBe(true);
  });
});
