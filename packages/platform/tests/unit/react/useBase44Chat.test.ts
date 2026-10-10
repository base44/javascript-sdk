// @vitest-environment jsdom
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { ChatMessage, Snapshot } from "../../../src/modules/builder.events.types.js";
import { useBase44Chat } from "../../../src/react/index.js";
import type { Base44Chat, Base44ChatOptions, Base44ChatServer } from "../../../src/react/index.js";

// The platform client is replaced by a recorder: the test plays snapshots and events into the
// subscription the hook opened, and checks which sessions were opened and closed.
type FakeSession = { subs: Record<string, { onSnapshot(s: Snapshot): unknown; onEvent(e: unknown): unknown; onError(e: unknown): void }>; closed: boolean; connect: () => Promise<void> };
const fake = vi.hoisted(() => ({ sessions: [] as FakeSession[], clients: [] as unknown[] }));
vi.mock("../../../src/client.js", () => ({
  Base44PlatformClient: class {
    builder: { init(options: unknown): FakeSession };
    constructor(options: unknown) {
      fake.clients.push(options);
      this.builder = {
        init() {
          const session: FakeSession & { subscribe(appId: string, opts: FakeSession["subs"][string]): unknown; close(): void } = {
            subs: {},
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
const message = (id: string, created: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({ id, role: "assistant", metadata: { created_date: created }, ...extra });
const waiting = (id: string, kind: "approval" | "choice" | "input" = "approval") => ({ id, name: "tool", status: "waiting_for_user_input" as const, waiting_on: { kind } });

function makeServer(): { [K in keyof Base44ChatServer]: ReturnType<typeof vi.fn> & Base44ChatServer[K] } {
  return {
    createApp: vi.fn(async (prompt: string) => ({ id: other, name: prompt })),
    openLiveSession: vi.fn(async () => ({ serverUrl: "https://socket.test", sessionToken: "session-token" })),
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
const snapshot = async (messages: ChatMessage[], state: "ready" | "processing" = "ready", appId = app) =>
  act(async () => { await session().subs[appId].onSnapshot({ status: { state }, messages }); });
const event = async (e: unknown, appId = app) => act(async () => { await session().subs[appId].onEvent(e); });

beforeEach(() => { fake.sessions.length = 0; fake.clients.length = 0; renders = 0; });
afterEach(async () => { for (const root of roots.splice(0)) await act(async () => root.unmount()); });

describe("connection", () => {
  test("without an app nothing connects and the chat is idle", async () => {
    const server = makeServer();
    await mount({ appId: null, server });
    expect(server.openLiveSession).not.toHaveBeenCalled();
    expect(latest).toMatchObject({ items: [], phase: "idle", error: null, canSend: true });
    await act(async () => { await latest.send("hello"); });
    expect(server.sendMessage).not.toHaveBeenCalled();
  });

  test("with an app it opens one live session from the server's answer, loads, then shows the snapshot", async () => {
    const server = makeServer();
    await mount({ appId: app, server });
    expect(server.openLiveSession).toHaveBeenCalledWith(app);
    expect(fake.clients).toEqual([{ serverUrl: "https://socket.test", getSessionToken: expect.any(Function) }]);
    expect(latest.phase).toBe("loading");
    await snapshot([message("m2", "2", { content: "second" }), message("m1", "1", { role: "user", content: "first" })], "processing");
    expect(latest.phase).toBe("building");
    expect(latest.items.map(i => [i.role, i.text])).toEqual([["user", "first"], ["assistant", "second"]]);
    expect(latest.messages.map(m => m.id)).toEqual(["m1", "m2"]);
  });

  test("events update, add and remove messages, and the status drives the phase", async () => {
    const { } = await mount({ appId: app, server: makeServer() });
    await snapshot([message("m1", "1", { content: "draft" })], "processing");
    await event({ type: "message.updated", appId: app, data: { message: message("m1", "1", { content: "final" }) } });
    await event({ type: "message.updated", appId: app, data: { message: message("m2", "2", { content: "more" }) } });
    expect(latest.items.map(i => i.text)).toEqual(["final", "more"]);
    await event({ type: "message.removed", appId: app, data: { message_id: "m1" } });
    expect(latest.items.map(i => i.id)).toEqual(["m2"]);
    await event({ type: "app.status_changed", appId: app, data: { status: { state: "ready" } } });
    expect(latest.phase).toBe("idle");
  });

  test("a failed session, a connection error and a subscription error all land in error with their code", async () => {
    const server = makeServer();
    server.openLiveSession.mockRejectedValueOnce(new Error("Socket session failed: 403"));
    const { render } = await mount({ appId: app, server });
    expect(latest.error).toEqual({ message: "Socket session failed: 403", code: undefined });
    await render({ appId: other, server });
    expect(latest.error).toBeNull();
    await act(async () => { session().subs[other].onError({ code: "access_revoked", message: "revoked" }); });
    expect(latest.error).toEqual({ message: "revoked", code: "access_revoked" });
    await act(async () => { latest.clearError(); });
    expect(latest.error).toBeNull();
  });

  test("switching apps closes the old session, starts over, and opens a new one", async () => {
    const server = makeServer();
    const { render } = await mount({ appId: app, server });
    await snapshot([message("m1", "1", { content: "old" })]);
    const first = session();
    await render({ appId: other, server });
    expect(first.closed).toBe(true);
    expect(latest.items).toEqual([]);
    expect(latest.phase).toBe("loading");
    expect(server.openLiveSession).toHaveBeenLastCalledWith(other);
    expect(fake.sessions).toHaveLength(2);
    await render({ appId: null, server });
    expect(session().closed).toBe(true);
    expect(latest.phase).toBe("idle");
  });

  test("an inline server object does not reopen the session, and the latest one is used", async () => {
    const server = makeServer();
    const { render } = await mount({ appId: app, server });
    const replacement = makeServer();
    await render({ appId: app, server: { ...replacement } });
    await render({ appId: app, server: { ...replacement } });
    expect(fake.sessions).toHaveLength(1);
    expect(server.openLiveSession).toHaveBeenCalledTimes(1);
    await act(async () => { await latest.send("hi"); });
    expect(replacement.sendMessage).toHaveBeenCalledWith(app, "hi");
    expect(server.sendMessage).not.toHaveBeenCalled();
  });

  test("unmounting closes the session", async () => {
    const { unmount } = await mount({ appId: app, server: makeServer() });
    await unmount();
    expect(session().closed).toBe(true);
  });
});

describe("questions", () => {
  test("an open question locks the input and answers exactly its own tool call", async () => {
    const server = makeServer();
    await mount({ appId: app, server });
    await snapshot([
      message("m1", "1", { tool_calls: [waiting("t1")] }),
      message("m2", "2", { tool_calls: [waiting("t2", "choice"), { id: "t3", name: "write_file", status: "success" }] }),
    ]);
    expect(latest.phase).toBe("waiting");
    expect(latest.canSend).toBe(false);
    expect(latest.items.map(i => i.question?.kind)).toEqual(["approval", "choice"]);
    const second = latest.items[1].question!;
    if (second.kind !== "choice") throw new Error("expected a choice");
    await act(async () => { await second.answer([["A"]]); });
    expect(server.submitToolCallInput).toHaveBeenCalledWith(app, {
      toolCallId: "t2", messageId: "m2", approve: true, extraUserInput: { answers: [{ question_index: 0, selected_labels: ["A"] }] },
    });
    expect(latest.items.map(i => i.question?.kind)).toEqual(["approval", undefined]);
    expect(latest.items[1].steps[0].status).toBe("waiting");
    const first = latest.items[0].question!;
    if (first.kind !== "approval") throw new Error("expected an approval");
    await act(async () => { await first.decline(); });
    expect(server.submitToolCallInput).toHaveBeenLastCalledWith(app, { toolCallId: "t1", messageId: "m1", approve: false, extraUserInput: undefined });
    expect(latest.phase).toBe("idle");
    expect(latest.canSend).toBe(true);
  });

  test("a reply the server refuses reopens the question and reports the error", async () => {
    const server = makeServer();
    server.submitToolCallInput.mockRejectedValueOnce(new Error("Submit answer failed: 409"));
    await mount({ appId: app, server });
    await snapshot([message("m1", "1", { tool_calls: [waiting("t1")] })]);
    const question = latest.items[0].question!;
    if (question.kind !== "approval") throw new Error("expected an approval");
    await act(async () => { await question.approve(); });
    expect(latest.items[0].question?.kind).toBe("approval");
    expect(latest.error).toEqual({ message: "Submit answer failed: 409", code: undefined });
    expect(latest.phase).toBe("waiting");
  });

  test("the question's actions keep working after an unrelated message arrives", async () => {
    const server = makeServer();
    await mount({ appId: app, server });
    await snapshot([message("m1", "1", { tool_calls: [waiting("t1")] })]);
    const question = latest.items[0].question!;
    await event({ type: "message.updated", appId: app, data: { message: message("m2", "2", { content: "meanwhile" }) } });
    await act(async () => { await question.decline(); });
    expect(server.submitToolCallInput).toHaveBeenCalledWith(app, { toolCallId: "t1", messageId: "m1", approve: false, extraUserInput: undefined });
  });
});

describe("sending and creating", () => {
  test("send goes to the current app and a refusal becomes the error", async () => {
    const server = makeServer();
    await mount({ appId: app, server });
    await snapshot([]);
    await act(async () => { await latest.send("make it blue"); });
    expect(server.sendMessage).toHaveBeenCalledWith(app, "make it blue");
    expect(latest.error).toBeNull();
    server.sendMessage.mockRejectedValueOnce(new Error("Send message failed: 429"));
    await act(async () => { await latest.send("again"); });
    expect(latest.error).toEqual({ message: "Send message failed: 429", code: undefined });
  });

  test("create reports the new app through onAppCreated and is the creating phase meanwhile", async () => {
    const server = makeServer();
    let resolve!: (app: { id: string; name: string }) => void;
    server.createApp.mockReturnValueOnce(new Promise(r => { resolve = r; }));
    const onAppCreated = vi.fn();
    await mount({ appId: null, server, onAppCreated });
    let done!: Promise<void>;
    await act(async () => { done = latest.create("A tiny habit app"); });
    expect(latest.phase).toBe("creating");
    expect(latest.canSend).toBe(false);
    await act(async () => { resolve({ id: other, name: "A tiny habit app" }); await done; });
    expect(onAppCreated).toHaveBeenCalledWith({ id: other, name: "A tiny habit app" });
    expect(latest.phase).toBe("idle");
    expect(server.openLiveSession).not.toHaveBeenCalled();
  });

  test("a failed create sets the error and calls nobody", async () => {
    const server = makeServer();
    server.createApp.mockRejectedValueOnce(new Error("Create app failed: 402"));
    const onAppCreated = vi.fn();
    await mount({ appId: null, server, onAppCreated });
    await act(async () => { await latest.create("x"); });
    expect(onAppCreated).not.toHaveBeenCalled();
    expect(latest).toMatchObject({ phase: "idle", canSend: true, error: { message: "Create app failed: 402" } });
  });

  test("actions and items keep their identity across renders that change nothing", async () => {
    const server = makeServer();
    const { render } = await mount({ appId: app, server });
    await snapshot([message("m1", "1", { content: "hello" })]);
    const { items, send, create, clearError } = latest;
    await render({ appId: app, server });
    expect(latest.items).toBe(items);
    expect(latest.send).toBe(send);
    expect(latest.create).toBe(create);
    expect(latest.clearError).toBe(clearError);
    expect(renders).toBeGreaterThan(0);
  });
});
