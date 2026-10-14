import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createPlatformClient, PlatformSocketError, type BuilderSession } from "../../src/index.js";

const fake = vi.hoisted(() => {
  const handlers: Record<string, (...args: any[]) => void> = {};
  const managerHandlers: Record<string, (...args: any[]) => void> = {};
  const socket = {
    connected: false,
    on: vi.fn((name, handler) => { handlers[name] = handler; }),
    onAny: vi.fn(handler => { handlers["*"] = handler; }),
    emit: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), removeAllListeners: vi.fn(), offAny: vi.fn(),
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
const session = (fields: Record<string, unknown> = {}) => ({
  session_id: "s1", session_token: "session-token", socket_url: "https://api.example.test", socket_path: "/ws/socket.io/", expires_in: 3600, ...fields,
});
const auth = async () => {
  const callback = vi.fn(); (fake.io.mock.calls.at(-1) as any)[1].auth(callback); await settle(); return callback;
};
function setup(getSession = vi.fn(async (): Promise<any> => session())) {
  const onError = vi.fn();
  const client = createPlatformClient().builder.init({ getSession, onError });
  clients.push(client);
  return { client, getSession, onError };
}
async function begin(client: BuilderSession) {
  client.connect().catch(() => {}); await settle();
}
async function connected(client: BuilderSession) {
  const ready = client.connect(); await settle(); fake.socket.connected = true; fake.handlers.connect(); await ready; await settle();
}
const joins = () => fake.socket.emit.mock.calls.filter(c => c[0] === "join");
beforeEach(() => { vi.clearAllMocks(); fake.socket.connected = false; });
afterEach(() => { clients.splice(0).forEach(client => client.close()); vi.useRealTimers(); });

describe("platform client", () => {
  test("creating the client and initializing sessions opens no socket and fetches no session", () => {
    const getSession = vi.fn(async () => session());
    const platform = createPlatformClient();
    const first = platform.builder.init({ getSession, onError: vi.fn() });
    const second = platform.builder.init({ getSession, onError: vi.fn() });
    clients.push(first, second);
    expect(first).not.toBe(second);
    expect(fake.io).not.toHaveBeenCalled();
    expect(getSession).not.toHaveBeenCalled();
  });

  test("closing one initialized builder does not close another or the root module", async () => {
    const firstSocket = { ...fake.socket, disconnect: vi.fn() };
    const secondSocket = { ...fake.socket, disconnect: vi.fn() };
    fake.io.mockReturnValueOnce(firstSocket).mockReturnValueOnce(secondSocket);
    const { client: first } = setup(), { client: second } = setup();
    await begin(first); await begin(second);
    first.close();
    expect(firstSocket.disconnect).toHaveBeenCalledOnce();
    expect(secondSocket.disconnect).not.toHaveBeenCalled();
  });

  test("opens the socket at the session's URL and path, with the token in CONNECT auth only", async () => {
    const { client, getSession } = setup(vi.fn(async () => session({ socket_url: "https://live.example.test/", socket_path: "/partner/socket.io/" })));
    await begin(client);
    const [url, options] = fake.io.mock.calls[0] as unknown as [string, any];
    expect(url).toBe("https://live.example.test");
    expect(options).toMatchObject({ path: "/partner/socket.io/", transports: ["websocket"], autoConnect: false, forceNew: true, reconnectionAttempts: 5 });
    expect(options.query).toBeUndefined();
    expect(fake.socket.connect).toHaveBeenCalledOnce();
    expect(await auth()).toHaveBeenLastCalledWith({ session_token: "session-token" });
    expect(getSession).toHaveBeenCalledOnce();
  });

  test("ignores the session body's other keys", async () => {
    const { client } = setup(vi.fn(async () => session({ future_field: { nested: true } })));
    await begin(client);
    const [, options] = fake.io.mock.calls[0] as unknown as [string, any];
    for (const key of ["session_id", "expires_in", "future_field"]) expect(options).not.toHaveProperty(key);
    const callback = await auth();
    expect(callback.mock.calls[0][0]).toStrictEqual({ session_token: "session-token" });
  });

  test("transport reconnects reuse the session instead of opening a new one", async () => {
    const { client, getSession } = setup();
    await connected(client);
    fake.handlers.disconnect("transport close");
    expect(await auth()).toHaveBeenLastCalledWith({ session_token: "session-token" });
    expect(getSession).toHaveBeenCalledOnce();
    expect(fake.io).toHaveBeenCalledOnce();
  });

  test("a rejected cached token is renewed once, and a rejected fresh one is reported", async () => {
    const { client, getSession, onError } = setup();
    await connected(client);
    fake.handlers.disconnect("transport close"); fake.socket.connected = false; fake.socket.connect.mockClear();
    denied(false);
    expect(fake.socket.connect).toHaveBeenCalledOnce();
    getSession.mockResolvedValue(session({ session_token: "renewed" }));
    expect(await auth()).toHaveBeenLastCalledWith({ session_token: "renewed" });
    denied(false);
    expect(fake.socket.connect).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0][0].code).toBe("connection_denied");
  });

  test("a retryable refusal is retried with backoff before giving up", async () => {
    vi.useFakeTimers();
    const { client, onError } = setup();
    const failure = expect(client.connect()).rejects.toMatchObject({ code: "connection_failed" });
    await settle(); fake.socket.connect.mockClear();
    for (let i = 0; i < 5; i++) { denied(true); await vi.advanceTimersByTimeAsync(10000); }
    expect(fake.socket.connect).toHaveBeenCalledTimes(5);
    denied(true); await failure;
    expect(onError.mock.calls[0][0].code).toBe("connection_failed");
  });

  test("an expired session reconnects with a new session", async () => {
    const { client, getSession, onError } = setup();
    await connected(client); fake.socket.connect.mockClear();
    notice("session.ended", { reason: "expired" }, null);
    fake.handlers.disconnect("io server disconnect");
    expect(fake.socket.connect).toHaveBeenCalledOnce();
    getSession.mockResolvedValue(session({ session_token: "next-session" }));
    expect(await auth()).toHaveBeenLastCalledWith({ session_token: "next-session" });
    expect(fake.io).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
  });

  test("a renewed session at a new address moves the socket and rejoins every subscription", async () => {
    const { client, getSession, onError } = setup();
    client.subscribe(app, { onSnapshot: vi.fn(), onEvent: vi.fn(), onError: vi.fn() });
    client.subscribe(other, { onSnapshot: vi.fn(), onEvent: vi.fn(), onError: vi.fn() });
    await connected(client);
    const handlers: Record<string, (...args: any[]) => void> = {};
    const moved = {
      ...fake.socket, connected: false, on: vi.fn((name, handler) => { handlers[name] = handler; }),
      emit: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), removeAllListeners: vi.fn(),
      io: { on: vi.fn(), removeAllListeners: vi.fn() },
    };
    fake.io.mockReturnValueOnce(moved);
    getSession.mockResolvedValue(session({ session_token: "moved", socket_url: "https://eu.example.test", socket_path: "/eu/socket.io/" }));
    notice("session.ended", { reason: "expired" }, null);
    fake.handlers.disconnect("io server disconnect");
    expect(await auth()).not.toHaveBeenCalled();
    expect(fake.socket.removeAllListeners).toHaveBeenCalledOnce();
    expect(fake.socket.disconnect).toHaveBeenCalledOnce();
    const [url, options] = fake.io.mock.calls.at(-1) as unknown as [string, any];
    expect([url, options.path]).toEqual(["https://eu.example.test", "/eu/socket.io/"]);
    expect(moved.connect).toHaveBeenCalledOnce();
    expect(await auth()).toHaveBeenLastCalledWith({ session_token: "moved" });
    moved.connected = true; handlers.connect();
    expect(moved.emit.mock.calls).toEqual([["join", room], ["join", `/apps/${other}`]]);
    expect(getSession).toHaveBeenCalledTimes(2);
    expect(onError).not.toHaveBeenCalled();
  });

  test("a replaced session stops without reconnecting", async () => {
    const { client, onError } = setup();
    await connected(client); fake.socket.connect.mockClear();
    notice("session.ended", { reason: "replaced" }, null);
    fake.handlers.disconnect("io server disconnect");
    expect(fake.socket.connect).not.toHaveBeenCalled();
    expect(onError.mock.calls[0][0].code).toBe("session_replaced");
  });

  test("a revoked session stops without asking for a new one", async () => {
    const { client, getSession, onError } = setup();
    await connected(client); fake.socket.connect.mockClear(); getSession.mockClear();
    notice("session.ended", { reason: "revoked" }, null);
    fake.handlers.disconnect("io server disconnect");
    expect(fake.socket.connect).not.toHaveBeenCalled();
    expect(getSession).not.toHaveBeenCalled();
    expect(onError.mock.calls[0][0].code).toBe("session_revoked");
  });

  test("shares concurrent connects; session failures never reach Socket.IO", async () => {
    const { client, onError } = setup(vi.fn(async () => { throw new Error("secret"); }));
    const a = client.connect(), b = client.connect(); expect(a).toBe(b);
    await expect(a).rejects.toMatchObject({ code: "session_unavailable" });
    expect(fake.io).not.toHaveBeenCalled();
    expect(onError.mock.calls[0][0].message).not.toContain("secret");
  });

  test("a failed renewal stops the socket without authenticating it", async () => {
    const { client, getSession, onError } = setup();
    await connected(client);
    getSession.mockRejectedValue(new Error("secret"));
    notice("session.ended", { reason: "expired" }, null);
    fake.handlers.disconnect("io server disconnect");
    expect(await auth()).not.toHaveBeenCalled();
    expect(fake.socket.disconnect).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0][0].code).toBe("session_unavailable");
  });

  test("session retrieval has a bounded timeout", async () => {
    vi.useFakeTimers();
    const { client } = setup(vi.fn(() => new Promise<any>(() => {})));
    const failure = expect(client.connect()).rejects.toMatchObject({ code: "session_unavailable" });
    await vi.advanceTimersByTimeAsync(20000); await failure;
    expect(fake.io).not.toHaveBeenCalled();
  });

  test("a late session opens no socket after close", async () => {
    let resolve!: (value: unknown) => void;
    const { client } = setup(vi.fn(() => new Promise<any>(r => { resolve = r; })));
    await begin(client); client.close(); resolve(session()); await settle();
    expect(fake.io).not.toHaveBeenCalled();
  });

  test("a late renewed session cannot authenticate after close", async () => {
    let resolve!: (value: unknown) => void;
    const { client, getSession } = setup();
    await connected(client);
    getSession.mockImplementation(() => new Promise<any>(r => { resolve = r; }));
    notice("session.ended", { reason: "expired" }, null);
    fake.handlers.disconnect("io server disconnect");
    const callback = await auth();
    client.close(); resolve(session({ session_token: "secret" })); await settle();
    expect(callback).not.toHaveBeenCalled();
    expect(fake.io).toHaveBeenCalledOnce();
  });

  test.each([
    { session_token: "", socket_url: "https://example.test", socket_path: "/ws/socket.io/" },
    { session_token: "t", socket_url: "https://secret@example.test", socket_path: "/ws/socket.io/" },
    { session_token: "t", socket_url: "https://example.test?token=secret", socket_path: "/ws/socket.io/" },
    { session_token: "t", socket_url: "https://example.test/path", socket_path: "/ws/socket.io/" },
    { session_token: "t", socket_url: "ws://example.test", socket_path: "/ws/socket.io/" },
    { session_token: "t", socket_url: "example.test", socket_path: "/ws/socket.io/" },
    { session_token: "t", socket_url: "https://example.test", socket_path: "ws/socket.io/" },
    { session_token: "t", socket_url: "https://example.test", socket_path: "//evil.test/socket.io/" },
    { session_token: "t", socket_url: "https://example.test", socket_path: "/ws/socket.io/?token=secret" },
    { session_token: "t", socket_url: "https://example.test" },
    "not a session",
  ])("an invalid session is session_unavailable: %j", async body => {
    const { client, onError } = setup(vi.fn(async () => body));
    await expect(client.connect()).rejects.toBeInstanceOf(PlatformSocketError);
    expect(onError.mock.calls[0][0].code).toBe("session_unavailable");
    expect(fake.io).not.toHaveBeenCalled();
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

  test("a snapshot passes its queue through when the server sends one", async () => {
    const { client } = setup(); const onSnapshot = vi.fn();
    client.subscribe(app, { onSnapshot, onEvent: vi.fn(), onError: vi.fn() });
    await connected(client);
    const queue = { items: [{ id: "q1", content: "next" }], is_paused: false };
    fake.handlers["app.snapshot"]({ room, data: { status: { state: "ready", turn_id: "m1" }, messages: [], queue } });
    snapshot(); await settle();
    expect(onSnapshot.mock.calls[0][0]).toEqual({ room, status: { state: "ready", turn_id: "m1" }, messages: [], queue });
    expect(onSnapshot.mock.calls[1][0]).not.toHaveProperty("queue");
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

  test("forwards an event the SDK doesn't know to its app only", async () => {
    const { client } = setup(); const onEvent = vi.fn(), otherEvent = vi.fn();
    client.subscribe(app, { onSnapshot: vi.fn(), onEvent, onError: vi.fn() });
    client.subscribe(other, { onSnapshot: vi.fn(), onEvent: otherEvent, onError: vi.fn() });
    await connected(client);
    for (const name of ["app.renamed", "message.updated", "app.snapshot", "session.ended", "room.access_denied", "room.new_notice"]) {
      fake.handlers["*"](name, { room, data: { name: "Shop" } });
    }
    await settle();
    expect(onEvent.mock.calls).toEqual([[{ type: "unknown", name: "app.renamed", appId: app, data: { name: "Shop" } }]]);
    expect(otherEvent).not.toHaveBeenCalled();
  });

  test("a malformed unknown event fails only its app", async () => {
    const { client } = setup(); const onError = vi.fn();
    const sub = client.subscribe(app, { onSnapshot: vi.fn(), onEvent: vi.fn(), onError });
    const second = client.subscribe(other, { onSnapshot: vi.fn(), onEvent: vi.fn(), onError: vi.fn() }); await connected(client);
    fake.handlers["*"]("app.renamed", { room, data: [] });
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
    expect(fake.socket.removeAllListeners).toHaveBeenCalledOnce(); expect(fake.socket.offAny).toHaveBeenCalledOnce();
  });

  test("validates app IDs, duplicate subscriptions and limits", () => {
    const { client } = setup(); const options = { onSnapshot: vi.fn(), onEvent: vi.fn(), onError: vi.fn() };
    expect(() => client.subscribe("bad", options)).toThrow(TypeError);
    client.subscribe(app, options); expect(() => client.subscribe(app, options)).toThrow(TypeError);
    for (let i = 0; i < 7; i++) client.subscribe(String(i).repeat(24), options);
    expect(() => client.subscribe(other, options)).toThrowError(expect.objectContaining({ code: "subscription_limit" }));
  });
});
