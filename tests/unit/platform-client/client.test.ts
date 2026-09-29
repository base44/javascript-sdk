import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { Base44PlatformClient, type BuilderSession } from "../../../platform-src/client/index.js";

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
const clients: BuilderSession[] = [];
const settle = async () => { for (let i = 0; i < 100; i++) await Promise.resolve(); };
const snapshot = (messages: unknown[] = []) => fake.handlers["app.snapshot"]({ room, data: { status: { state: "ready" }, messages } });
const update = (data: unknown = { status: null }) => fake.handlers["app.status_changed"]({ room, data });
const notice = (name: string, data: unknown = {}, at: string | null = room) => fake.handlers[name]({ room: at, data });
const denied = (retryable: boolean) => fake.handlers.connect_error(Object.assign(new Error("connection_denied"), { data: { retryable } }));
const auth = async () => {
  const callback = vi.fn(); (fake.io.mock.calls.at(-1) as any)[1].auth(callback); await settle(); return callback;
};
function setup(getSessionToken = vi.fn(async () => "session-token")) {
  const onError = vi.fn();
  const platform = new Base44PlatformClient({ serverUrl: "https://api.example.test", getSessionToken });
  const client = platform.builder.init({ onError });
  clients.push(client);
  return { client, getSessionToken, onError };
}
async function connected(client: BuilderSession) {
  const ready = client.connect(); fake.socket.connected = true; fake.handlers.connect(); await ready; await settle();
}
const joins = () => fake.socket.emit.mock.calls.filter(c => c[0] === "join");
beforeEach(() => { vi.clearAllMocks(); fake.socket.connected = false; });
afterEach(() => { clients.splice(0).forEach(client => client.close()); vi.useRealTimers(); });

describe("platform client", () => {
  test("constructing the root client does not initialize sockets or fetch session tokens", () => {
    const getSessionToken = vi.fn(async () => "token");
    const platform = new Base44PlatformClient({ serverUrl: "https://api.example.test", getSessionToken });
    expect(fake.io).not.toHaveBeenCalled();
    const first = platform.builder.init({ onError: vi.fn() });
    const second = platform.builder.init({ onError: vi.fn() });
    clients.push(first, second);
    expect(first).not.toBe(second);
    expect(fake.io).toHaveBeenCalledTimes(2);
    expect(fake.socket.connect).not.toHaveBeenCalled();
    expect(getSessionToken).not.toHaveBeenCalled();
  });

  test("closing one initialized builder does not close another or the root module", () => {
    const platform = new Base44PlatformClient({ serverUrl: "https://api.example.test", getSessionToken: async () => "token" });
    const firstSocket = { ...fake.socket, disconnect: vi.fn() };
    const secondSocket = { ...fake.socket, disconnect: vi.fn() };
    fake.io.mockReturnValueOnce(firstSocket).mockReturnValueOnce(secondSocket);
    const first = platform.builder.init({ onError: vi.fn() });
    const second = platform.builder.init({ onError: vi.fn() });
    clients.push(first, second);
    first.close();
    expect(firstSocket.disconnect).toHaveBeenCalledOnce();
    expect(secondSocket.disconnect).not.toHaveBeenCalled();
  });

  test("connects to the shared platform socket with the session token in CONNECT auth only", async () => {
    const { getSessionToken } = setup();
    const [url, options] = fake.io.mock.calls[0] as unknown as [string, any];
    expect(url).toBe("https://api.example.test");
    expect(options).toMatchObject({ path: "/ws/socket.io/", transports: ["websocket"], autoConnect: false, forceNew: true, reconnectionAttempts: 5 });
    expect(options.query).toBeUndefined();
    expect(await auth()).toHaveBeenLastCalledWith({ session_token: "session-token" });
    expect(getSessionToken).toHaveBeenCalledOnce();
  });

  test("transport reconnects reuse the session token instead of opening a new session", async () => {
    const { client, getSessionToken } = setup();
    await auth(); await connected(client);
    fake.handlers.disconnect("transport close");
    expect(await auth()).toHaveBeenLastCalledWith({ session_token: "session-token" });
    expect(getSessionToken).toHaveBeenCalledOnce();
  });

  test("a rejected cached token is renewed once, and a rejected fresh one is reported", async () => {
    const { client, getSessionToken, onError } = setup();
    await auth(); await connected(client);
    fake.handlers.disconnect("transport close"); fake.socket.connected = false; fake.socket.connect.mockClear();
    denied(false);
    expect(fake.socket.connect).toHaveBeenCalledOnce();
    getSessionToken.mockResolvedValue("renewed");
    expect(await auth()).toHaveBeenLastCalledWith({ session_token: "renewed" });
    denied(false);
    expect(fake.socket.connect).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0][0].code).toBe("connection_denied");
  });

  test("a retryable refusal is retried with backoff before giving up", async () => {
    vi.useFakeTimers();
    const { client, onError } = setup();
    const failure = expect(client.connect()).rejects.toMatchObject({ code: "connection_failed" });
    fake.socket.connect.mockClear();
    for (let i = 0; i < 5; i++) { denied(true); await vi.advanceTimersByTimeAsync(10000); }
    expect(fake.socket.connect).toHaveBeenCalledTimes(5);
    denied(true); await failure;
    expect(onError.mock.calls[0][0].code).toBe("connection_failed");
  });

  test("an expired session reconnects with a new session token", async () => {
    const { client, getSessionToken, onError } = setup();
    await auth(); await connected(client); fake.socket.connect.mockClear();
    notice("session.ended", { reason: "expired" }, null);
    fake.handlers.disconnect("io server disconnect");
    expect(fake.socket.connect).toHaveBeenCalledOnce();
    getSessionToken.mockResolvedValue("next-session");
    expect(await auth()).toHaveBeenLastCalledWith({ session_token: "next-session" });
    expect(onError).not.toHaveBeenCalled();
  });

  test("a replaced session stops without reconnecting", async () => {
    const { client, onError } = setup();
    await auth(); await connected(client); fake.socket.connect.mockClear();
    notice("session.ended", { reason: "replaced" }, null);
    fake.handlers.disconnect("io server disconnect");
    expect(fake.socket.connect).not.toHaveBeenCalled();
    expect(onError.mock.calls[0][0].code).toBe("session_replaced");
  });

  test("shares concurrent connects; session-token failures never reach Socket.IO", async () => {
    const { client, onError } = setup(vi.fn(async () => { throw new Error("secret"); }));
    const a = client.connect(), b = client.connect(); expect(a).toBe(b);
    const rejection = expect(a).rejects.toMatchObject({ code: "session_unavailable" });
    const callback = await auth();
    await rejection;
    expect(callback).not.toHaveBeenCalled();
    expect(onError.mock.calls[0][0].message).not.toContain("secret");
  });

  test("session-token retrieval has a bounded timeout", async () => {
    vi.useFakeTimers();
    const { client } = setup(vi.fn(() => new Promise<string>(() => {})));
    const failure = expect(client.connect()).rejects.toMatchObject({ code: "session_unavailable" });
    const callback = vi.fn(); (fake.io.mock.calls[0] as any)[1].auth(callback);
    await vi.advanceTimersByTimeAsync(20000); await failure;
    expect(callback).not.toHaveBeenCalled();
  });

  test("late session tokens cannot authenticate after close", async () => {
    let resolve!: (token: string) => void;
    const { client } = setup(vi.fn(() => new Promise<string>(r => { resolve = r; })));
    const callback = vi.fn(); (fake.io.mock.calls[0] as any)[1].auth(callback);
    await settle(); client.close(); resolve("secret"); await settle(); expect(callback).not.toHaveBeenCalled();
  });

  test("joins without metadata and delivers the snapshot, then events in order", async () => {
    const { client } = setup(); const onSnapshot = vi.fn(), onEvent = vi.fn();
    client.subscribe(app, { onSnapshot, onEvent, onError: vi.fn() });
    await connected(client);
    expect(joins()).toEqual([["join", room]]);
    snapshot([{ id: "m", role: "assistant", content: "hi" }]);
    fake.handlers["message.updated"]({ room, data: { message: { id: "m", content: "hello" } } });
    await settle();
    expect(onSnapshot).toHaveBeenCalledExactlyOnceWith({ room, status: { state: "ready" }, messages: [{ id: "m", role: "assistant", content: "hi" }] });
    expect(onEvent).toHaveBeenCalledExactlyOnceWith({ type: "message.updated", appId: app, data: { message: { id: "m", content: "hello" } } });
  });

  test("reconnect rejoins active subscriptions for a fresh snapshot", async () => {
    const { client } = setup();
    client.subscribe(app, { onSnapshot: vi.fn(), onEvent: vi.fn(), onError: vi.fn() });
    await connected(client);
    fake.handlers.disconnect("transport close"); fake.handlers.connect(); await settle();
    expect(joins()).toEqual([["join", room], ["join", room]]);
  });

  test("async callbacks are serialized per app", async () => {
    const { client } = setup(); let finish!: () => void; const order: string[] = [];
    client.subscribe(app, {
      onSnapshot: () => new Promise<void>(r => { order.push("snapshot"); finish = r; }),
      onEvent: () => { order.push("event"); }, onError: vi.fn(),
    });
    await connected(client); snapshot(); update(); await settle();
    expect(order).toEqual(["snapshot"]);
    finish(); await settle(); expect(order).toEqual(["snapshot", "event"]);
  });

  test("callback rejection ends the subscription and leaves the room", async () => {
    const { client } = setup(); const onError = vi.fn();
    const sub = client.subscribe(app, { onSnapshot: vi.fn(), onEvent: async () => { throw new Error("private"); }, onError });
    await connected(client); update(); await settle();
    expect(sub.active).toBe(false);
    expect(onError.mock.calls[0][0]).toMatchObject({ code: "handler_failed", appId: app });
    expect(onError.mock.calls[0][0].message).not.toContain("private");
    expect(fake.socket.emit).toHaveBeenLastCalledWith("leave", room);
  });

  test.each(["access_denied", "access_revoked"])("%s ends only that app's subscription", async code => {
    const { client } = setup(); const onError = vi.fn();
    const sub = client.subscribe(app, { onSnapshot: vi.fn(), onEvent: vi.fn(), onError });
    const second = client.subscribe(other, { onSnapshot: vi.fn(), onEvent: vi.fn(), onError: vi.fn() });
    await connected(client); notice(`room.${code}`);
    expect(sub.active).toBe(false); expect(second.active).toBe(true);
    expect(onError.mock.calls[0][0]).toMatchObject({ code, appId: app });
    fake.handlers.connect(); await settle();
    expect(joins().filter(c => c[1] === room)).toHaveLength(1);
  });

  test("an unavailable snapshot is reported without ending the subscription", async () => {
    const { client } = setup(); const onError = vi.fn(), onEvent = vi.fn();
    const sub = client.subscribe(app, { onSnapshot: vi.fn(), onEvent, onError });
    await connected(client); notice("room.snapshot_unavailable"); update(); await settle();
    expect(sub.active).toBe(true); expect(onEvent).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0][0]).toMatchObject({ code: "snapshot_unavailable", appId: app });
  });

  test("routes every public event by room and keeps apps isolated", async () => {
    const { client } = setup(); const onEvent = vi.fn(), otherEvent = vi.fn();
    client.subscribe(app, { onSnapshot: vi.fn(), onEvent, onError: vi.fn() });
    client.subscribe(other, { onSnapshot: vi.fn(), onEvent: otherEvent, onError: vi.fn() });
    await connected(client);
    const names = [
      "message.updated", "message.removed", "app.status_changed", "preview.reload_requested",
      "preview.navigation_requested", "queue.updated", "task.progressed", "image.resolved",
      "conversation.changed", "files.changed", "branch.deleted", "repository.changed", "pull_request.changed",
    ];
    for (const name of names) fake.handlers[name]({ room, data: { branch_id: "feature" } });
    await settle(); expect(onEvent.mock.calls.map(c => c[0].type)).toEqual(names);
    expect(onEvent.mock.calls[10][0]).toEqual({ type: "branch.deleted", appId: app, data: { branch_id: "feature" } });
    expect(otherEvent).not.toHaveBeenCalled();
  });

  test("a rewrite of main rejoins for a fresh snapshot; a branch rewrite does not", async () => {
    const { client } = setup(); const onEvent = vi.fn();
    client.subscribe(app, { onSnapshot: vi.fn(), onEvent, onError: vi.fn() });
    await connected(client);
    fake.handlers["conversation.changed"]({ room, data: { branch_id: "feature" } });
    expect(joins()).toHaveLength(1);
    fake.handlers["conversation.changed"]({ room, data: {} });
    await settle();
    expect(joins()).toEqual([["join", room], ["join", room]]);
    expect(onEvent).toHaveBeenCalledTimes(2);
  });

  test("a malformed envelope fails only the identified app", async () => {
    const { client } = setup(); const onError = vi.fn();
    const sub = client.subscribe(app, { onSnapshot: vi.fn(), onEvent: vi.fn(), onError });
    const second = client.subscribe(other, { onSnapshot: vi.fn(), onEvent: vi.fn(), onError: vi.fn() }); await connected(client);
    fake.handlers["message.updated"]({ room, data: "{" });
    expect(sub.active).toBe(false); expect(second.active).toBe(true);
    expect(onError.mock.calls[0][0].code).toBe("protocol_error");
  });

  test("bounded pending delivery overflows explicitly", async () => {
    const { client } = setup(); const onError = vi.fn();
    const sub = client.subscribe(app, { onSnapshot: vi.fn(), onEvent: () => new Promise(() => {}), onError });
    await connected(client); for (let i = 0; i <= 1000; i++) update();
    expect(sub.active).toBe(false); expect(onError.mock.calls[0][0].code).toBe("delivery_overflow");
  });

  test("unsubscribe cancels queued work, re-subscribing rejoins, and close is terminal", async () => {
    const { client } = setup(); const onEvent = vi.fn();
    const sub = client.subscribe(app, { onSnapshot: vi.fn(), onEvent, onError: vi.fn() }); await connected(client);
    update(); sub.unsubscribe(); sub.unsubscribe(); await settle(); expect(onEvent).not.toHaveBeenCalled();
    client.subscribe(app, { onSnapshot: vi.fn(), onEvent, onError: vi.fn() });
    expect(joins()).toEqual([["join", room], ["join", room]]);
    client.close(); client.close(); expect(fake.socket.disconnect).toHaveBeenCalledOnce();
    await expect(client.connect()).rejects.toMatchObject({ code: "client_closed" });
    expect(fake.socket.removeAllListeners).toHaveBeenCalledOnce();
  });

  test("validates origins, app IDs, duplicate subscriptions and limits", () => {
    for (const serverUrl of ["https://secret@example.test", "https://example.test?token=secret", "https://example.test/path", "ws://example.test"]) {
      expect(() => new Base44PlatformClient({ serverUrl, getSessionToken: () => "token" })).toThrow(TypeError);
    }
    const { client } = setup(); const options = { onSnapshot: vi.fn(), onEvent: vi.fn(), onError: vi.fn() };
    expect(() => client.subscribe("bad", options)).toThrow(TypeError);
    client.subscribe(app, options); expect(() => client.subscribe(app, options)).toThrow(TypeError);
    for (let i = 0; i < 7; i++) client.subscribe(String(i).repeat(24), options);
    expect(() => client.subscribe(other, options)).toThrowError(expect.objectContaining({ code: "subscription_limit" }));
  });
});
