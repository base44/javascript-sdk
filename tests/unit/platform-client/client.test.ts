import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { Base44PlatformClient } from "../../../platform-src/client/index.js";

const fake = vi.hoisted(() => {
  const handlers: Record<string, (...args: any[]) => void> = {};
  const managerHandlers: Record<string, (...args: any[]) => void> = {};
  const socket = {
    connected: false,
    on: vi.fn((name, handler) => { handlers[name] = handler; }),
    emit: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), removeAllListeners: vi.fn(),
    io: { on: vi.fn((name, handler) => { managerHandlers[name] = handler; }), removeAllListeners: vi.fn() },
  };
  return { handlers, managerHandlers, socket, io: vi.fn(() => socket) };
});
vi.mock("socket.io-client", () => ({ io: fake.io }));

const app = "a".repeat(24), other = "b".repeat(24), room = `/apps/${app}`;
const clients: Base44PlatformClient[] = [];
const settle = async () => { for (let i = 0; i < 100; i++) await Promise.resolve(); };
const joined = (seq = "boundary") => fake.handlers.joined({ room, seq, max_entries: 2000, inactivity_expiry_seconds: 3600 });
const update = (seq: string, data: unknown = { status: null }) => fake.handlers.update_model({ room, seq, data: JSON.stringify(data) });
function setup(getToken = vi.fn(async () => "browser-token")) {
  const onError = vi.fn();
  const client = new Base44PlatformClient({ serverUrl: "https://api.example.test", getToken, onError });
  clients.push(client);
  return { client, getToken, onError };
}
async function connected(client: Base44PlatformClient) {
  const ready = client.connect(); fake.socket.connected = true; fake.handlers.connect(); await ready; await settle();
}
beforeEach(() => { vi.clearAllMocks(); fake.socket.connected = false; });
afterEach(() => { clients.splice(0).forEach(client => client.close()); vi.useRealTimers(); });

describe("platform client", () => {
  test("uses only CONNECT auth and the fixed namespace/path, with fresh credentials each attempt", async () => {
    const { client, getToken } = setup();
    expect(fake.socket.connect).not.toHaveBeenCalled();
    const [url, options] = fake.io.mock.calls[0] as unknown as [string, any];
    expect(url).toBe("https://api.example.test/partner");
    expect(options).toMatchObject({ path: "/ws-whitelabel/socket.io/", transports: ["websocket"], autoConnect: false, forceNew: true, reconnectionAttempts: 5 });
    expect(options.query).toBeUndefined();
    const callback = vi.fn(); options.auth(callback); await settle();
    expect(callback).toHaveBeenLastCalledWith({ token: "browser-token" });
    getToken.mockResolvedValue("rotated"); options.auth(callback); await settle();
    expect(callback).toHaveBeenLastCalledWith({ token: "rotated" });
    await connected(client);
  });

  test("shares concurrent connects and rejects a sanitized denial", async () => {
    const { client, onError } = setup();
    const a = client.connect(), b = client.connect(); expect(a).toBe(b);
    const rejection = expect(a).rejects.toMatchObject({ code: "connection_denied" });
    fake.handlers.connect_error({ message: "secret token", data: { code: "connection_denied" } });
    await rejection;
    expect(onError.mock.calls[0][0].message).not.toContain("secret");
    await connected(client);
  });

  test("token failures reject without handing credentials or provider errors to Socket.IO", async () => {
    const { client, onError } = setup(vi.fn(async () => { throw new Error("secret"); }));
    const rejection = expect(client.connect()).rejects.toMatchObject({ code: "token_unavailable" });
    const callback = vi.fn(); (fake.io.mock.calls[0] as any)[1].auth(callback);
    await rejection;
    expect(callback).not.toHaveBeenCalled();
    expect(onError.mock.calls[0][0].message).not.toContain("secret");
  });


  test("token retrieval has a bounded timeout", async () => {
    vi.useFakeTimers();
    const { client } = setup(vi.fn(() => new Promise<string>(() => {})));
    const failure = expect(client.connect()).rejects.toMatchObject({ code: "token_unavailable" });
    const callback = vi.fn(); (fake.io.mock.calls[0] as any)[1].auth(callback);
    await vi.advanceTimersByTimeAsync(20000); await failure;
    expect(callback).not.toHaveBeenCalled();
  });

  test("late token results cannot authenticate after close", async () => {
    let resolve!: (token: string) => void;
    const { client } = setup(vi.fn(() => new Promise<string>(r => { resolve = r; })));
    const callback = vi.fn(); (fake.io.mock.calls[0] as any)[1].auth(callback);
    await settle(); client.close(); resolve("secret"); await settle(); expect(callback).not.toHaveBeenCalled();
  });

  test("fresh subscription waits for joined; preserves null, omission and message replacement", async () => {
    const { client } = setup(); const onEvent = vi.fn();
    const sub = client.subscribe(app, { onEvent, onError: vi.fn() });
    await connected(client);
    expect(fake.socket.emit).toHaveBeenCalledWith("join", room, {});
    update("old"); joined(); update("one", { _last_msg: { id: "m", content: "hello" }, status: null });
    await settle();
    expect(onEvent).toHaveBeenCalledExactlyOnceWith({ type: "update_model", appId: app, seq: "one", data: { _last_msg: { id: "m", content: "hello" }, status: null } });
    expect(sub.cursor).toBe("one");
  });

  test("resumed replay applies before joined and serializes async handlers", async () => {
    const { client } = setup(); let finish!: () => void;
    const onEvent = vi.fn(() => new Promise<void>(r => { finish = r; })); const onJoined = vi.fn();
    const sub = client.subscribe(app, { afterSeq: "saved", onEvent, onJoined, onError: vi.fn() });
    await connected(client); update("replay"); joined("replay"); await settle();
    expect(sub.cursor).toBe("saved"); expect(onJoined).not.toHaveBeenCalled();
    finish(); await settle(); expect(sub.cursor).toBe("replay"); expect(onJoined).toHaveBeenCalledOnce();
  });

  test("reconnect waits for in-flight application and rejoins with its resulting cursor", async () => {
    const { client } = setup(); let finish!: () => void;
    client.subscribe(app, { afterSeq: "saved", onEvent: () => new Promise<void>(r => { finish = r; }), onError: vi.fn() });
    await connected(client); update("applied"); await settle();
    fake.socket.connected = false; fake.handlers.disconnect("transport close");
    fake.socket.connected = true; fake.handlers.connect(); await settle();
    expect(fake.socket.emit.mock.calls.filter(c => c[0] === "join")).toHaveLength(1);
    finish(); await settle(); expect(fake.socket.emit).toHaveBeenLastCalledWith("join", room, { after_seq: "applied" });
  });

  test("callback rejection stops delivery without advancing the cursor", async () => {
    const { client } = setup(); const onError = vi.fn();
    const sub = client.subscribe(app, { afterSeq: "saved", onEvent: async () => { throw new Error("private"); }, onError });
    await connected(client); update("failed"); await settle();
    expect(sub.cursor).toBe("saved"); expect(sub.active).toBe(false);
    expect(onError.mock.calls[0][0]).toMatchObject({ code: "handler_failed", appId: app });
    expect(fake.socket.emit).toHaveBeenLastCalledWith("leave", room);
  });

  test.each(["invalid_room", "invalid_cursor", "access_denied", "subscription_limit", "resync_required", "stream_unavailable"])("surfaces %s without silently resetting/retrying a subscription", async code => {
    const { client } = setup(); const onError = vi.fn();
    const sub = client.subscribe(app, { afterSeq: "saved", onEvent: vi.fn(), onError });
    await connected(client); fake.handlers.error({ room, code });
    expect(sub.active).toBe(false); expect(sub.cursor).toBe("saved");
    expect(onError.mock.calls[0][0].code).toBe(code);
    fake.handlers.connect(); await settle();
    expect(fake.socket.emit.mock.calls.filter(c => c[0] === "join")).toHaveLength(1);
  });

  test("routes all five event shapes and keeps app cursors isolated", async () => {
    const { client } = setup(); const onEvent = vi.fn(), otherEvent = vi.fn();
    const sub = client.subscribe(app, { afterSeq: "saved", onEvent, onError: vi.fn() });
    const second = client.subscribe(other, { afterSeq: "other", onEvent: otherEvent, onError: vi.fn() });
    await connected(client);
    update("1");
    fake.handlers.directive({ room, seq: "2", type: "conversation_changed", branch_id: "feature" });
    fake.handlers.queue_update({ app_id: app, seq: "3", items: [], is_paused: false });
    fake.handlers.task_update({ room, seq: "4", data: '{"event_type":"task_progress","progress":{"current":1}}' });
    fake.handlers.image_ready({ room, seq: "5", data: '{"placeholder_url":"placeholder","status":"completed","image_url":"image"}' });
    await settle(); expect(onEvent.mock.calls.map(c => c[0].type)).toEqual(["update_model", "directive", "queue_update", "task_update", "image_ready"]);
    expect(onEvent.mock.calls[1][0].data).toEqual({ room, type: "conversation_changed", branch_id: "feature" });
    expect(sub.cursor).toBe("5"); expect(second.cursor).toBe("other"); expect(otherEvent).not.toHaveBeenCalled();
  });

  test("duplicate last cursor is not applied twice", async () => {
    const { client } = setup(); const onEvent = vi.fn();
    client.subscribe(app, { afterSeq: "saved", onEvent, onError: vi.fn() }); await connected(client);
    update("one"); update("one"); await settle(); expect(onEvent).toHaveBeenCalledOnce();
  });

  test("malformed JSON fails only the identified app without losing its cursor", async () => {
    const { client } = setup(); const onError = vi.fn();
    const sub = client.subscribe(app, { afterSeq: "saved", onEvent: vi.fn(), onError });
    const second = client.subscribe(other, { onEvent: vi.fn(), onError: vi.fn() }); await connected(client);
    fake.handlers.update_model({ room, seq: "bad", data: "{" });
    expect(sub.cursor).toBe("saved"); expect(sub.active).toBe(false); expect(second.active).toBe(true);
    expect(onError.mock.calls[0][0].code).toBe("protocol_error");
  });

  test("bounded pending delivery overflows explicitly", async () => {
    const { client } = setup(); const onError = vi.fn();
    const sub = client.subscribe(app, { afterSeq: "saved", onEvent: () => new Promise(() => {}), onError });
    await connected(client); for (let i = 0; i <= 1000; i++) update(`event-${i}`);
    expect(sub.active).toBe(false); expect(sub.cursor).toBe("saved"); expect(onError.mock.calls[0][0].code).toBe("resync_required");
  });

  test("unsubscribe cancels queued work and close is terminal and idempotent", async () => {
    const { client } = setup(); const onEvent = vi.fn();
    const sub = client.subscribe(app, { afterSeq: "saved", onEvent, onError: vi.fn() }); await connected(client);
    update("late"); sub.unsubscribe(); sub.unsubscribe(); await settle(); expect(onEvent).not.toHaveBeenCalled();
    client.close(); client.close(); expect(fake.socket.disconnect).toHaveBeenCalledOnce();
    await expect(client.connect()).rejects.toMatchObject({ code: "client_closed" });
    expect(fake.socket.removeAllListeners).toHaveBeenCalledOnce();
  });


  test("re-subscribing fences late events with a new connection before joining", async () => {
    const { client } = setup();
    const first = client.subscribe(app, { afterSeq: "saved", onEvent: vi.fn(), onError: vi.fn() });
    await connected(client); first.unsubscribe();
    fake.socket.disconnect.mockImplementationOnce(() => {
      fake.socket.connected = false;
      fake.handlers.disconnect("io client disconnect");
    });
    client.subscribe(app, { afterSeq: "saved", onEvent: vi.fn(), onError: vi.fn() });
    await settle();
    expect(fake.socket.disconnect).toHaveBeenCalledOnce();
    expect(fake.socket.emit.mock.calls.filter(c => c[0] === "join")).toHaveLength(1);
    fake.socket.connected = true; fake.handlers.connect(); await settle();
    expect(fake.socket.emit).toHaveBeenLastCalledWith("join", room, { after_seq: "saved" });
  });

  test("validates origins, app IDs, duplicate subscriptions and limits", () => {
    for (const serverUrl of ["https://secret@example.test", "https://example.test?token=secret", "https://example.test/path", "ws://example.test"]) {
      expect(() => new Base44PlatformClient({ serverUrl, getToken: () => "token", onError: vi.fn() })).toThrow(TypeError);
    }
    const { client } = setup(); const options = { onEvent: vi.fn(), onError: vi.fn() };
    expect(() => client.subscribe("bad", options)).toThrow(TypeError);
    client.subscribe(app, options); expect(() => client.subscribe(app, options)).toThrow(TypeError);
    for (let i = 0; i < 7; i++) client.subscribe(String(i).repeat(24), options);
    expect(() => client.subscribe(other, options)).toThrowError(expect.objectContaining({ code: "subscription_limit" }));
  });
});
