// @vitest-environment jsdom
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Message, QueueItem } from "../../../src/client/modules/builder.events.generated.js";
import type { PlatformSnapshot } from "../../../src/client/modules/builder.events.types.js";
import type { SocketSession } from "../../../src/client/modules/builder.types.js";
import { useBase44Chat } from "../../../src/react/index.js";
import type { Base44Chat, Base44ChatOptions, Base44ChatBackend } from "../../../src/react/index.js";

// The platform client is replaced by a recorder: the test plays snapshots, events and connection
// changes into the session the hook opened, and checks which sessions were opened and closed.
// Like the real client, connect asks getSession for a session and reports a failure to onError.
type SubOptions = { onSnapshot(s: PlatformSnapshot): unknown; onEvent(e: unknown): unknown; onError(e: unknown): void };
type InitOptions = { getSession(): Promise<SocketSession>; onError(e: { code: string; message: string }): void };
type FakeSession = { subs: Record<string, SubOptions>; init: InitOptions; closed: boolean; sessions: SocketSession[]; connect: () => Promise<void> };
const fake = vi.hoisted(() => ({ sessions: [] as FakeSession[] }));
vi.mock("../../../src/client/client.js", () => ({
  createPlatformClient: () => ({
    builder: {
      init(init: InitOptions) {
        const session: FakeSession & { subscribe(appId: string, opts: SubOptions): unknown; close(): void } = {
          subs: {},
          init,
          closed: false,
          sessions: [],
          async connect() {
            try {
              session.sessions.push(await init.getSession());
            } catch {
              init.onError({ code: "session_unavailable", message: "Session unavailable" });
              throw new Error("session_unavailable");
            }
          },
          subscribe(appId, opts) { session.subs[appId] = opts; return { appId, active: true, unsubscribe() {} }; },
          close() { session.closed = true; },
        };
        fake.sessions.push(session);
        return session;
      },
    },
  }),
}));
vi.mock("../../../src/client.js", () => ({
  Base44PlatformClient: class {
    builder: { init(options: InitOptions): FakeSession };
    constructor(options: ClientOptions) {
      fake.clients.push(options);
      this.builder = {
        init(init) {
          const session: FakeSession & { subscribe(appId: string, opts: SubOptions): unknown; close(): void } = {
            subs: {},
            init,
            closed: false,
            connect: async () => {},
            subscribe(appId, opts) { session.subs[appId] = opts; return { appId, active: true, unsubscribe() {} }; },
            close() { session.closed = true; },
          };
          fake.sessions.push(session);
          return session;
        },
      };
    }
  },
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const app = "a".repeat(24), other = "b".repeat(24);
const message = (id: string, created: string, extra: Partial<Message> = {}): Message => ({ id, role: "assistant", metadata: { created_date: created }, ...extra });
const waiting = (id: string, kind: string = "approval") => ({ id, name: "tool", status: "waiting_for_user_input" as const, waiting_on: { kind: kind as "approval" } });

function makeBackend(): { [K in keyof Base44ChatBackend]: ReturnType<typeof vi.fn> & Base44ChatBackend[K] } {
  return {
    createApp: vi.fn(async (prompt: string) => ({ id: other, name: prompt })),
    openLiveSession: vi.fn(async (): Promise<SocketSession> => ({ session_token: "session-token", socket_url: "https://socket.test", socket_path: "/ws/socket.io/" })),
    sendMessage: vi.fn(async () => {}),
    submitToolCallInput: vi.fn(async () => {}),
  };
}

let latest!: Base44Chat;
let renders = 0;
function Probe(props: Base44ChatOptions) {
  renders++;
  latest = useBase44Chat(props);
  return null;
}
const roots: Root[] = [];
const settle = () => act(async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); });
async function mount(props: Base44ChatOptions) {
  const root = createRoot(document.createElement("div"));
  roots.push(root);
  const render = async (next: Base44ChatOptions) => { await act(async () => root.render(createElement(Probe, next))); await settle(); };
  await render(props);
  return { render, unmount: () => act(async () => root.unmount()) };
}
const session = () => fake.sessions.at(-1)!;
const snapshot = async (messages: Message[], state: "ready" | "processing" | "error" = "ready", extra: Partial<PlatformSnapshot> = {}, appId = app) =>
  act(async () => { await session().subs[appId].onSnapshot({ room: `/apps/${appId}`, status: { state }, messages, ...extra }); });
const event = async (e: unknown, appId = app) => act(async () => { await session().subs[appId].onEvent(e); });
const statusChanged = (state: "ready" | "processing" | "error") => event({ type: "app.status_changed", appId: app, data: { status: { state } } });
const updated = (m: Message) => event({ type: "message.updated", appId: app, data: { message: m } });
const queueUpdated = (items: QueueItem[], branch_id: string | null = null) => event({ type: "queue.updated", appId: app, data: { items, is_paused: false, branch_id } });
// A call the test resolves or rejects itself, to look at the chat while it is in flight.
function pending<T = void>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

beforeEach(() => { fake.sessions.length = 0; renders = 0; });
afterEach(async () => { for (const root of roots.splice(0)) await act(async () => root.unmount()); });

describe("the contract", () => {
  test("the hook returns exactly the documented fields", async () => {
    await mount({ appId: app, backend: makeBackend() });
    expect(Object.keys(latest).sort()).toEqual(["clearError", "connection", "create", "error", "items", "send", "status"]);
  });
});

describe("connection", () => {
  test("without an app nothing connects, and send needs an app", async () => {
    const backend = makeBackend();
    await mount({ appId: null, backend });
    expect(backend.openLiveSession).not.toHaveBeenCalled();
    expect(latest).toMatchObject({ items: [], status: "ready", connection: "connecting", error: null });
    await act(async () => { await latest.send("hello"); });
    expect(backend.sendMessage).not.toHaveBeenCalled();
    expect(backend.createApp).not.toHaveBeenCalled();
    expect(latest.error?.message).toMatch(/create one first/);
    expect(latest.status).toBe("ready");
  });

  test("with an app it opens one live session from the backend's answer, then shows the snapshot", async () => {
    const backend = makeBackend();
    await mount({ appId: app, backend });
    expect(backend.openLiveSession).toHaveBeenCalledWith(app);
    expect(latest.connection).toBe("connecting");
    await snapshot([message("m2", "2", { content: "second" }), message("m1", "1", { role: "user", content: "first" })], "processing");
    expect(latest.connection).toBe("connected");
    expect(latest.status).toBe("building");
    expect(latest.items.map(i => [i.role, i.text, i.createdAt])).toEqual([["user", "first", "1"], ["assistant", "second", "2"]]);
  });

  test("the client gets Base44's session body from the backend, unchanged", async () => {
    const backend = makeBackend();
    const body = { session_id: "s1", session_token: "t", socket_url: "https://socket.test", socket_path: "/live/socket.io/", expires_in: 3600 };
    backend.openLiveSession.mockResolvedValueOnce(body);
    await mount({ appId: app, backend });
    expect(session().sessions).toEqual([body]);
  });

  test("the session renews through openLiveSession when the client asks for a new one", async () => {
    const backend = makeBackend();
    await mount({ appId: app, backend });
    expect(backend.openLiveSession).toHaveBeenCalledTimes(1);
    // An hour later Base44 expires it, and the client asks again.
    const renewed = { session_token: "renewed-token", socket_url: "https://socket.test", socket_path: "/ws/socket.io/" };
    backend.openLiveSession.mockResolvedValueOnce(renewed);
    expect(await session().init.getSession()).toEqual(renewed);
    expect(backend.openLiveSession).toHaveBeenCalledTimes(2);
    expect(backend.openLiveSession).toHaveBeenLastCalledWith(app);
    expect(fake.sessions).toHaveLength(1);
  });

  test("connecting lasts until the first snapshot", async () => {
    await mount({ appId: app, backend: makeBackend() });
    expect(latest.connection).toBe("connecting");
    await snapshot([]);
    expect(latest.connection).toBe("connected");
  });

  test("a connection error stays through the next action, and only clearError clears it", async () => {
    await mount({ appId: app, backend: makeBackend() });
    await snapshot([]);
    await act(async () => { session().init.onError({ code: "session_revoked", message: "revoked" }); });
    await act(async () => { await latest.send("hello"); });
    expect(latest).toMatchObject({ connection: "disconnected", error: { code: "session_revoked" } });
    await act(async () => { latest.clearError(); });
    expect(latest.error).toBeNull();
  });

  test("a session failure that a later session fixed is not reported for another error", async () => {
    const backend = makeBackend();
    await mount({ appId: app, backend });
    backend.openLiveSession.mockRejectedValueOnce(new Error("Socket session failed: 503"));
    await expect(session().init.getSession()).rejects.toThrow("503");
    await session().init.getSession();
    await act(async () => { session().init.onError({ code: "session_unavailable", message: "Session unavailable" }); });
    expect(latest.error).toMatchObject({ message: "Session unavailable", code: "session_unavailable" });
  });

  test("a reconnect keeps the messages before the snapshot's window, and a rewrite replaces them", async () => {
    const at = (i: number) => `2026-10-16T10:${String(i).padStart(2, "0")}:00Z`;
    const range = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => message(`m${from + i}`, at(from + i)));
    await mount({ appId: app, backend: makeBackend() });
    await snapshot(range(0, 50));
    for (const m of range(50, 60)) await updated(m);
    expect(latest.items).toHaveLength(60);
    // The socket drops and rejoins: Base44 sends only the newest 50.
    await snapshot(range(10, 60));
    expect(latest.items.map(i => i.id)).toEqual(range(0, 60).map(m => m.id));
    // An undo rewrites main: the next snapshot is the whole truth.
    await event({ type: "conversation.changed", appId: app, data: { branch_id: null } });
    await snapshot(range(5, 55));
    expect(latest.items.map(i => i.id)).toEqual(range(5, 55).map(m => m.id));
    // A branch's rewrite is not main's.
    await event({ type: "conversation.changed", appId: app, data: { branch_id: "branch-1" } });
    await snapshot(range(6, 56));
    expect(latest.items[0].id).toBe("m5");
  });

  test("events update, add and remove messages, and the app state drives the status", async () => {
    await mount({ appId: app, backend: makeBackend() });
    await snapshot([message("m1", "1", { content: "draft" })], "processing");
    await updated(message("m1", "1", { content: "final" }));
    await updated(message("m2", "2", { content: "more" }));
    expect(latest.items.map(i => i.text)).toEqual(["final", "more"]);
    await event({ type: "message.removed", appId: app, data: { message_id: "m1" } });
    expect(latest.items.map(i => i.id)).toEqual(["m2"]);
    await statusChanged("ready");
    expect(latest.status).toBe("ready");
  });

  test("a failed session, a connection error and a subscription error all land in error, with the socket's code", async () => {
    const backend = makeBackend();
    const refused = new Error("Socket session failed: 403");
    backend.openLiveSession.mockRejectedValueOnce(refused);
    const { render } = await mount({ appId: app, backend });
    // The client forwards no detail of a failed session, so the hook reports the backend's own error.
    expect(latest.error).toEqual({ message: "Socket session failed: 403", code: "session_unavailable", cause: refused });
    expect(latest.connection).toBe("disconnected");
    await render({ appId: other, backend });
    expect(latest.error).toBeNull();
    expect(latest.connection).toBe("connecting");
    const revoked = { code: "access_revoked", message: "revoked" };
    await act(async () => { session().subs[other].onError(revoked); });
    expect(latest.error).toEqual({ message: "revoked", code: "access_revoked", cause: revoked });
    expect(latest.connection).toBe("disconnected");
    await act(async () => { session().init.onError({ code: "connection_failed", message: "failed" }); });
    expect(latest.error).toMatchObject({ code: "connection_failed" });
    await act(async () => { latest.clearError(); });
    expect(latest.error).toBeNull();
    expect(latest.connection).toBe("disconnected");
  });

  test("retries that run out are disconnected, and a missing snapshot is only an error", async () => {
    await mount({ appId: app, backend: makeBackend() });
    await snapshot([]);
    await act(async () => { session().subs[app].onError({ code: "snapshot_unavailable", message: "no snapshot" }); });
    expect(latest).toMatchObject({ connection: "connected", error: { code: "snapshot_unavailable" } });
    await act(async () => { session().init.onError({ code: "connection_failed", message: "gave up" }); });
    expect(latest).toMatchObject({ connection: "disconnected", error: { code: "connection_failed" } });
  });

  test("switching apps closes the old session, resets everything, and opens a new one", async () => {
    const backend = makeBackend();
    backend.sendMessage.mockRejectedValueOnce(new Error("Send message failed: 409"));
    const { render } = await mount({ appId: app, backend });
    await snapshot([message("m1", "1", { content: "old" })], "error");
    await act(async () => { await latest.send("x"); });
    const first = session();
    await render({ appId: other, backend });
    expect(first.closed).toBe(true);
    expect(latest).toMatchObject({ items: [], status: "ready", connection: "connecting", error: null });
    expect(backend.openLiveSession).toHaveBeenLastCalledWith(other);
    expect(fake.sessions).toHaveLength(2);
    await render({ appId: null, backend });
    expect(session().closed).toBe(true);
    expect(latest.status).toBe("ready");
  });

  test("an error from the old session after a switch does not reach the new app", async () => {
    const backend = makeBackend();
    const { render } = await mount({ appId: app, backend });
    const first = session();
    await render({ appId: other, backend });
    await act(async () => { first.init.onError({ code: "client_closed", message: "closed" }); });
    expect(latest.error).toBeNull();
  });

  test("an inline backend object does not reopen the session, and the latest one is used", async () => {
    const backend = makeBackend();
    const { render } = await mount({ appId: app, backend });
    const replacement = makeBackend();
    await render({ appId: app, backend: { ...replacement } });
    await render({ appId: app, backend: { ...replacement } });
    expect(fake.sessions).toHaveLength(1);
    expect(backend.openLiveSession).toHaveBeenCalledTimes(1);
    await act(async () => { await latest.send("hi"); });
    expect(replacement.sendMessage).toHaveBeenCalledWith(app, "hi");
    expect(backend.sendMessage).not.toHaveBeenCalled();
    await session().init.getSession();
    expect(replacement.openLiveSession).toHaveBeenCalledWith(app);
  });

  test("unmounting closes the session", async () => {
    const { unmount } = await mount({ appId: app, backend: makeBackend() });
    await unmount();
    expect(session().closed).toBe(true);
  });
});

describe("status", () => {
  test("a failed build is the error status, with an error that clearError leaves while Base44 reports it", async () => {
    await mount({ appId: app, backend: makeBackend() });
    await snapshot([], "error");
    expect(latest.status).toBe("error");
    expect(latest.error).toEqual({ message: "The build failed", code: "build_failed" });
    await act(async () => { latest.clearError(); });
    expect(latest.error).toMatchObject({ code: "build_failed" });
    await statusChanged("processing");
    expect(latest.status).toBe("building");
    expect(latest.error).toBeNull();
    await statusChanged("error");
    expect(latest.status).toBe("error");
  });

  test("an earlier turn's status, resent after the next turn started, is ignored", async () => {
    // Recorded from Base44 while a queue drained: Q4's ready arrived during Q6's turn.
    const at = (state: string, turn: string, updated: string) =>
      event({ type: "app.status_changed", appId: app, data: { status: { state, turn_id: turn, last_updated_date: `2026-10-16T14:10:${updated}` } } });
    await mount({ appId: app, backend: makeBackend() });
    await snapshot([]);
    await at("processing", "q4", "13.63");
    await at("ready", "q4", "24.64");
    await at("processing", "q6", "36.94");
    await at("ready", "q4", "24.64");
    expect(latest.status).toBe("building");
    await at("ready", "q5", "35.30");
    expect(latest.status).toBe("building");
    await at("ready", "q6", "54.79");
    expect(latest.status).toBe("ready");
  });

  test("precedence: error over waiting over building", async () => {
    await mount({ appId: app, backend: makeBackend() });
    await snapshot([message("m1", "1", { tool_calls: [waiting("t1")] })], "error");
    expect(latest.status).toBe("error");
    await statusChanged("processing");
    expect(latest.status).toBe("waiting");
    await updated(message("m1", "1", { tool_calls: [{ ...waiting("t1"), status: "running" }] }));
    expect(latest.status).toBe("building");
  });

  test("a send is submitted from the call until Base44 reports work", async () => {
    const backend = makeBackend();
    const call = pending();
    backend.sendMessage.mockReturnValueOnce(call.promise);
    await mount({ appId: app, backend });
    await snapshot([]);
    let done!: Promise<void>;
    await act(async () => { done = latest.send("make it blue"); });
    expect(latest.status).toBe("submitted");
    // Base44 echoes the prompt: that is not a reply.
    await updated(message("u1", "1", { role: "user", content: "make it blue" }));
    expect(latest.status).toBe("submitted");
    await act(async () => { call.resolve(); await done; });
    expect(latest.status).toBe("submitted");
    await statusChanged("processing");
    expect(latest.status).toBe("building");
    await statusChanged("ready");
    expect(latest.status).toBe("ready");
  });

  test("a submitted send ends with a new reply, or with a queue change", async () => {
    await mount({ appId: app, backend: makeBackend() });
    await snapshot([message("m1", "1")]);
    await act(async () => { await latest.send("a"); });
    await updated(message("m1", "1", { content: "an edit of an old reply" }));
    expect(latest.status).toBe("submitted");
    await updated(message("m2", "2", { content: "done" }));
    expect(latest.status).toBe("ready");
    await act(async () => { await latest.send("b"); });
    await queueUpdated([{ id: "q1", content: "b" }]);
    expect(latest.status).toBe("ready");
  });

  test("a failed send sets error without changing the status, and a 409 is never lost", async () => {
    const backend = makeBackend();
    const refused = new Error("Send message failed: 409");
    backend.sendMessage.mockRejectedValueOnce(refused);
    await mount({ appId: app, backend });
    await snapshot([], "processing");
    await act(async () => { await latest.send("make it blue"); });
    expect(backend.sendMessage).toHaveBeenCalledWith(app, "make it blue");
    expect(latest.error).toEqual({ message: "Send message failed: 409", cause: refused });
    expect(latest.status).toBe("building");
    await statusChanged("ready");
    expect(latest.status).toBe("ready");
  });

  test("a prompt sent mid-build leaves the status building", async () => {
    await mount({ appId: app, backend: makeBackend() });
    await snapshot([], "processing");
    await act(async () => { await latest.send("and a footer"); });
    expect(latest.status).toBe("building");
    await queueUpdated([{ id: "q1", content: "and a footer" }]);
    expect(latest.status).toBe("building");
  });
});

describe("pending prompts", () => {
  const shown = () => latest.items.map(i => [i.text, i.pending]);

  test("a sent prompt shows at once, and Base44's own message takes its place", async () => {
    const backend = makeBackend();
    const call = pending();
    backend.sendMessage.mockReturnValueOnce(call.promise);
    await mount({ appId: app, backend });
    await snapshot([message("m1", "1", { content: "hello" })]);
    await act(async () => { void latest.send("make it blue"); });
    expect(shown()).toEqual([["hello", false], ["make it blue", true]]);
    expect(latest.items[1]).toMatchObject({ role: "user", steps: [] });
    await updated(message("u1", "2", { role: "user", content: "make it blue" }));
    expect(shown()).toEqual([["hello", false], ["make it blue", false]]);
    await act(async () => { call.resolve(); });
    expect(shown()).toEqual([["hello", false], ["make it blue", false]]);
  });

  test("a prompt Base44 echoes with other text still settles, oldest first", async () => {
    await mount({ appId: app, backend: makeBackend() });
    await snapshot([]);
    await act(async () => { await latest.send("first"); await latest.send("second"); });
    await updated(message("u1", "1", { role: "user", content: "first (edited)" }));
    expect(shown()).toEqual([["first (edited)", false], ["second", true]]);
  });

  test("a prompt Base44 queues stays pending, in the order sent, until it runs", async () => {
    await mount({ appId: app, backend: makeBackend() });
    await snapshot([], "processing");
    await act(async () => { await latest.send("Q5"); });
    await queueUpdated([{ id: "q5", content: "Q5" }]);
    await act(async () => { await latest.send("Q7"); });
    await queueUpdated([{ id: "q5", content: "Q5" }, { id: "q7", content: "Q7" }]);
    expect(shown()).toEqual([["Q5", true], ["Q7", true]]);
    await queueUpdated([{ id: "q7", content: "Q7" }]);
    expect(shown()).toEqual([["Q5", true], ["Q7", true]]);
    await updated(message("u5", "5", { role: "user", content: "Q5" }));
    expect(shown()).toEqual([["Q5", false], ["Q7", true]]);
  });

  test("a failed send removes the prompt", async () => {
    const backend = makeBackend();
    backend.sendMessage.mockRejectedValueOnce(new Error("Send message failed: 409"));
    await mount({ appId: app, backend });
    await snapshot([]);
    await act(async () => { await latest.send("x"); });
    expect(latest.items).toEqual([]);
    expect(latest.error).toMatchObject({ message: "Send message failed: 409" });
  });

  test("the first prompt shows while the app is created, and the new app's snapshot settles it", async () => {
    const backend = makeBackend();
    const call = pending<{ id: string; name: string }>();
    backend.createApp.mockReturnValueOnce(call.promise);
    await mount({ appId: null, backend });
    let done!: Promise<void>;
    await act(async () => { done = latest.create("A tiny habit app"); });
    expect(shown()).toEqual([["A tiny habit app", true]]);
    await act(async () => { call.resolve({ id: other, name: "A tiny habit app" }); await done; });
    await settle();
    expect(shown()).toEqual([["A tiny habit app", true]]);
    await snapshot([message("u1", "1", { role: "user", content: "A tiny habit app" })], "processing", {}, other);
    expect(shown()).toEqual([["A tiny habit app", false]]);
  });

  test("a snapshot full of old prompts settles only an exact match, never the oldest", async () => {
    await mount({ appId: app, backend: makeBackend() });
    await act(async () => { await latest.send("again"); });
    await snapshot([message("u0", "0", { role: "user", content: "older" })]);
    expect(shown()).toEqual([["older", false], ["again", true]]);
  });

  test("switching apps drops the pending prompts", async () => {
    const backend = makeBackend();
    const { render } = await mount({ appId: app, backend });
    await snapshot([]);
    await act(async () => { await latest.send("x"); });
    await render({ appId: other, backend });
    expect(latest.items).toEqual([]);
  });
});


describe("questions", () => {
  test("every waiting step in a message is a question that answers exactly its own tool call", async () => {
    const backend = makeBackend();
    await mount({ appId: app, backend });
    await snapshot([
      message("m1", "1", { tool_calls: [waiting("t1"), waiting("t2", "choice"), { id: "t3", name: "write_file", status: "success" }] }),
    ]);
    expect(latest.status).toBe("waiting");
    expect(latest.items[0].steps.map(s => s.question?.kind)).toEqual(["approval", "choice", undefined]);
    const choice = latest.items[0].steps[1].question!;
    if (choice.kind !== "choice") throw new Error("expected a choice");
    await act(async () => { await choice.answer([["A"]]); });
    expect(backend.submitToolCallInput).toHaveBeenCalledWith(app, {
      toolCallId: "t2", messageId: "m1", approve: true, extraUserInput: { answers: [{ question_index: 0, selected_labels: ["A"] }] },
    });
    expect(latest.items[0].steps.map(s => s.question?.kind)).toEqual(["approval", undefined, undefined]);
    expect(latest.items[0].steps[1].status).toBe("waiting");
    expect(latest.status).toBe("waiting");
    const approval = latest.items[0].steps[0].question!;
    if (approval.kind !== "approval") throw new Error("expected an approval");
    await act(async () => { await approval.decline(); });
    expect(backend.submitToolCallInput).toHaveBeenLastCalledWith(app, { toolCallId: "t1", messageId: "m1", approve: false, extraUserInput: undefined });
    expect(latest.status).toBe("submitted");
    await statusChanged("processing");
    expect(latest.status).toBe("building");
  });

  test("secrets are Base44's input kind, submitted as secrets", async () => {
    const backend = makeBackend();
    await mount({ appId: app, backend });
    await snapshot([message("m1", "1", { tool_calls: [waiting("t1", "input")] })]);
    const question = latest.items[0].steps[0].question!;
    if (question.kind !== "secrets") throw new Error("expected secrets");
    await act(async () => { await question.submit({ API_KEY: "value" }); });
    expect(backend.submitToolCallInput).toHaveBeenCalledWith(app, { toolCallId: "t1", messageId: "m1", approve: true, extraUserInput: { secrets: { API_KEY: "value" } } });
  });

  test("a reply the backend refuses reopens the question and reports the error", async () => {
    const backend = makeBackend();
    backend.submitToolCallInput.mockRejectedValueOnce(new Error("Submit answer failed: 409"));
    await mount({ appId: app, backend });
    await snapshot([message("m1", "1", { tool_calls: [waiting("t1")] })]);
    const question = latest.items[0].steps[0].question!;
    if (question.kind !== "approval") throw new Error("expected an approval");
    await act(async () => { await question.approve(); });
    expect(latest.items[0].steps[0].question?.kind).toBe("approval");
    expect(latest.error).toMatchObject({ message: "Submit answer failed: 409" });
    expect(latest.status).toBe("waiting");
  });

  test("a kind this release doesn't know is declined once, then shows stopped when Base44 says so", async () => {
    const backend = makeBackend();
    await mount({ appId: app, backend });
    await snapshot([message("m1", "1", { tool_calls: [waiting("t1", "plan_review")] })]);
    expect(backend.submitToolCallInput).toHaveBeenCalledTimes(1);
    expect(backend.submitToolCallInput).toHaveBeenCalledWith(app, { toolCallId: "t1", messageId: "m1", approve: false });
    expect(latest.items[0].steps[0]).toMatchObject({ status: "waiting" });
    expect(latest.items[0].steps[0].question).toBeUndefined();
    expect(latest.status).toBe("ready");
    await updated(message("m1", "1", { content: "still", tool_calls: [waiting("t1", "plan_review")] }));
    expect(backend.submitToolCallInput).toHaveBeenCalledTimes(1);
    await updated(message("m1", "1", { tool_calls: [{ ...waiting("t1", "plan_review"), status: "stopped" }] }));
    expect(latest.items[0].steps[0].status).toBe("stopped");
  });

  test("a failed decline shows the error and waits, and the next snapshot tries once more", async () => {
    const backend = makeBackend();
    backend.submitToolCallInput.mockRejectedValueOnce(new Error("Submit answer failed: 500"));
    await mount({ appId: app, backend });
    const parked = [message("m1", "1", { tool_calls: [waiting("t1", "plan_review")] })];
    await snapshot(parked);
    expect(latest).toMatchObject({ status: "waiting", error: { message: "Submit answer failed: 500" } });
    await updated(message("m1", "1", { content: "still", tool_calls: [waiting("t1", "plan_review")] }));
    expect(backend.submitToolCallInput).toHaveBeenCalledTimes(1);
    // A reconnect's snapshot.
    await snapshot(parked);
    expect(backend.submitToolCallInput).toHaveBeenCalledTimes(2);
    expect(latest.status).toBe("ready");
  });

  test("an unknown kind left in an earlier turn, or with no kind, is never declined", async () => {
    const backend = makeBackend();
    await mount({ appId: app, backend });
    await snapshot([
      message("m0", "0", { tool_calls: [waiting("t0", "plan_review")] }),
      message("u1", "1", { role: "user" }),
      message("m1", "2", { tool_calls: [{ id: "t1", name: "tool", status: "waiting_for_user_input" }] }),
    ]);
    expect(backend.submitToolCallInput).not.toHaveBeenCalled();
    expect(latest.status).toBe("waiting");
  });

  test("a question left waiting in an earlier turn neither holds the chat nor can be answered", async () => {
    await mount({ appId: app, backend: makeBackend() });
    await snapshot([message("m1", "1", { tool_calls: [waiting("t1", "choice")] }), message("u1", "2", { role: "user" }), message("m2", "3", { content: "done" })]);
    expect(latest.status).toBe("ready");
    expect(latest.items[0].steps[0]).toMatchObject({ status: "waiting" });
    expect(latest.items[0].steps[0].question).toBeUndefined();
  });

  test("an answered call is forgotten once Base44 stops reporting it waiting, so it can ask again", async () => {
    await mount({ appId: app, backend: makeBackend() });
    await snapshot([message("m1", "1", { tool_calls: [waiting("t1")] })]);
    await act(async () => { await (latest.items[0].steps[0].question as { approve(): Promise<void> }).approve(); });
    expect(latest.items[0].steps[0].question).toBeUndefined();
    await updated(message("m1", "1", { tool_calls: [{ ...waiting("t1"), status: "running" }] }));
    await updated(message("m1", "1", { tool_calls: [waiting("t1")] }));
    expect(latest.items[0].steps[0].question?.kind).toBe("approval");
  });

  test("the question's actions keep working after an unrelated message arrives", async () => {
    const backend = makeBackend();
    await mount({ appId: app, backend });
    await snapshot([message("m1", "1", { tool_calls: [waiting("t1")] })]);
    const question = latest.items[0].steps[0].question!;
    await updated(message("m2", "2", { content: "meanwhile" }));
    await act(async () => { await question.decline(); });
    expect(backend.submitToolCallInput).toHaveBeenCalledWith(app, { toolCallId: "t1", messageId: "m1", approve: false, extraUserInput: undefined });
  });
});

describe("creating", () => {
  test("create is submitted through the switch to the new app, until its build shows", async () => {
    const backend = makeBackend();
    const call = pending<{ id: string; name: string }>();
    backend.createApp.mockReturnValueOnce(call.promise);
    let render!: (next: Base44ChatOptions) => Promise<void>;
    const onAppCreated = vi.fn((created: { id: string }) => { void render({ appId: created.id, backend, onAppCreated }); });
    ({ render } = await mount({ appId: null, backend, onAppCreated }));
    let done!: Promise<void>;
    await act(async () => { done = latest.create("A tiny habit app"); });
    expect(latest.status).toBe("submitted");
    await act(async () => { call.resolve({ id: other, name: "A tiny habit app" }); await done; });
    await settle();
    expect(onAppCreated).toHaveBeenCalledWith({ id: other, name: "A tiny habit app" });
    expect(backend.openLiveSession).toHaveBeenCalledWith(other);
    // The chat already watched the new app, so passing its id back reopens nothing.
    expect(backend.openLiveSession).toHaveBeenCalledTimes(1);
    expect(fake.sessions).toHaveLength(1);
    expect(latest).toMatchObject({ status: "submitted", connection: "connecting" });
    await snapshot([message("u1", "1", { role: "user", content: "A tiny habit app" })], "processing", {}, other);
    expect(latest.status).toBe("building");
  });

  test("a partner that never passes the new id back still gets the new app's chat", async () => {
    const backend = makeBackend();
    await mount({ appId: null, backend });
    await act(async () => { await latest.create("A tiny habit app"); });
    await settle();
    expect(backend.openLiveSession).toHaveBeenCalledWith(other);
    expect(latest.status).toBe("submitted");
    await snapshot([], "processing", {}, other);
    expect(latest).toMatchObject({ status: "building", connection: "connected" });
    await act(async () => { session().subs[other].onEvent({ type: "app.status_changed", appId: other, data: { status: { state: "ready" } } }); });
    await act(async () => { await latest.send("make it blue"); });
    expect(backend.sendMessage).toHaveBeenCalledWith(other, "make it blue");
  });

  test("any change to appId forgets the created app, so null again is a new chat", async () => {
    const backend = makeBackend();
    const { render } = await mount({ appId: null, backend });
    await act(async () => { await latest.create("x"); });
    await settle();
    const created = session();
    await render({ appId: app, backend });
    expect(created.closed).toBe(true);
    expect(backend.openLiveSession).toHaveBeenLastCalledWith(app);
    await render({ appId: null, backend });
    expect(session().closed).toBe(true);
    expect(backend.openLiveSession).toHaveBeenCalledTimes(2);
    expect(latest).toMatchObject({ items: [], status: "ready" });
    await act(async () => { await latest.send("x"); });
    expect(backend.sendMessage).not.toHaveBeenCalled();
  });

  test("a set appId wins over the app create made, which is only reported", async () => {
    const backend = makeBackend();
    const onAppCreated = vi.fn();
    await mount({ appId: app, backend, onAppCreated });
    await snapshot([]);
    await act(async () => { await latest.create("another app"); });
    await settle();
    expect(onAppCreated).toHaveBeenCalledWith({ id: other, name: "another app" });
    expect(backend.openLiveSession).toHaveBeenCalledTimes(1);
    expect(latest.status).toBe("ready");
  });

  test("switching to an app this chat did not just create is not submitted", async () => {
    const backend = makeBackend();
    const call = pending<{ id: string; name: string }>();
    backend.createApp.mockReturnValueOnce(call.promise);
    const { render } = await mount({ appId: null, backend });
    await act(async () => { void latest.create("x"); });
    await render({ appId: app, backend });
    expect(latest.status).toBe("ready");
  });

  test("a failed create sets the error and calls nobody", async () => {
    const backend = makeBackend();
    backend.createApp.mockRejectedValueOnce(new Error("Create app failed: 402"));
    const onAppCreated = vi.fn();
    await mount({ appId: null, backend, onAppCreated });
    await act(async () => { await latest.create("x"); });
    expect(onAppCreated).not.toHaveBeenCalled();
    expect(latest).toMatchObject({ status: "ready", error: { message: "Create app failed: 402" } });
  });

  test("an inline backend keeps the actions and items the same across renders", async () => {
    const { render } = await mount({ appId: app, backend: { ...makeBackend() } });
    await snapshot([message("m1", "1", { tool_calls: [waiting("t1")] })]);
    const { items, send, create } = latest;
    await render({ appId: app, backend: { ...makeBackend() } });
    expect(latest.items).toBe(items);
    expect(latest.send).toBe(send);
    expect(latest.create).toBe(create);
  });

  test("actions and items keep their identity across renders that change nothing", async () => {
    const backend = makeBackend();
    const { render } = await mount({ appId: app, backend });
    await snapshot([message("m1", "1", { content: "hello" })]);
    const { items, send, create, clearError } = latest;
    await render({ appId: app, backend });
    expect(latest.items).toBe(items);
    expect(latest.send).toBe(send);
    expect(latest.create).toBe(create);
    expect(latest.clearError).toBe(clearError);
    expect(renders).toBeGreaterThan(0);
  });
});
