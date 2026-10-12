// @vitest-environment jsdom
import { act, memo } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { ChatMessage, Snapshot } from "../../../src/modules/builder.events.types.js";
import {
  Base44ChatProvider, Message, useBase44Chat, useChatActions, useChatComponents, useChatState,
  type ApprovalQuestion, type Base44ChatProviderProps, type Base44ChatServer, type StepProps,
} from "../../../src/react/index.js";

// The platform client is replaced by a recorder, as in the hook's own test.
type Sub = { onSnapshot(s: Snapshot): unknown; onEvent(e: unknown): unknown; onError(e: unknown): void };
const fake = vi.hoisted(() => ({ subs: [] as Record<string, Sub>[] }));
vi.mock("../../../src/client.js", () => ({
  Base44PlatformClient: class {
    builder = {
      init() {
        const subs: Record<string, Sub> = {};
        fake.subs.push(subs);
        return { connect: async () => {}, close() {}, subscribe(appId: string, opts: Sub) { subs[appId] = opts; return { appId, active: true, unsubscribe() {} }; } };
      },
    };
  },
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const app = "a".repeat(24);
const message = (id: string, created: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({ id, role: "assistant", metadata: { created_date: created }, ...extra });
const makeServer = () => ({
  createApp: vi.fn(async (prompt: string) => ({ id: "b".repeat(24), name: prompt })),
  openLiveSession: vi.fn(async () => ({ serverUrl: "https://socket.test", sessionToken: "token" })),
  sendMessage: vi.fn(async () => {}),
  submitToolCallInput: vi.fn(async () => {}),
}) satisfies Base44ChatServer;

const conversation: ChatMessage[] = [
  message("m1", "1", { role: "user", content: "A habit app" }),
  message("m2", "2", {
    tool_calls: [
      { id: "t0", name: "write_file", status: "success", display: { file_paths: ["src/App.jsx"] } },
      { id: "t1", name: "ask_clarifying_questions", status: "waiting_for_user_input", waiting_on: { kind: "choice" }, arguments: { questions: [{ question: "Tracked how?", options: ["Daily", { label: "Weekly" }] }] } },
    ],
  }),
  message("m3", "3", { tool_calls: [{ id: "t2", name: "send_email", status: "waiting_for_user_input", waiting_on: { kind: "approval" }, approval: { guard: "g", reason: "Sends mail" } }] }),
  message("m4", "4", { tool_calls: [{ id: "t3", name: "set_secrets", status: "waiting_for_user_input", waiting_on: { kind: "input" }, arguments: { secrets_schema: [{ secretName: "API_KEY" }] } }] }),
];

function Messages() {
  const { items } = useChatState();
  return <>{items.map(item => <section key={item.id} data-item={item.id}><Message item={item} /></section>)}</>;
}

let container: HTMLDivElement;
let root: Root;
const settle = () => act(async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); });
async function render(node: React.ReactNode) {
  await act(async () => root.render(node));
  await settle();
}
const snapshot = (messages: ChatMessage[]) => act(async () => { await fake.subs.at(-1)![app].onSnapshot({ status: { state: "ready" }, messages }); });
const event = (e: unknown) => act(async () => { await fake.subs.at(-1)![app].onEvent(e); });
const $ = (selector: string) => container.querySelector<HTMLElement>(selector);
const click = (el: Element | null) => act(async () => { (el as HTMLElement).click(); });
const button = (scope: string, text: string) => [...container.querySelectorAll<HTMLButtonElement>(`${scope} button`)].find(b => b.textContent === text) ?? null;
function type(input: HTMLInputElement | null, value: string) {
  return act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input!.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

beforeEach(() => {
  fake.subs.length = 0;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("fallback parts", () => {
  test("every part has an unstyled fallback: text, steps and each question kind", async () => {
    await render(<Base44ChatProvider appId={app} server={makeServer()}><Messages /></Base44ChatProvider>);
    await snapshot(conversation);
    expect($('[data-item="m1"] [data-base44="text"]')?.textContent).toBe("A habit app");
    expect($('[data-item="m1"] [data-base44="text"]')?.dataset.role).toBe("user");
    const steps = [...container.querySelectorAll<HTMLElement>('[data-item="m2"] [data-base44="step"]')];
    expect(steps.map(s => [s.textContent, s.dataset.status])).toEqual([["write_file src/App.jsx", "done"], ["ask_clarifying_questions", "waiting"]]);
    expect($('[data-item="m2"] legend')?.textContent).toBe("Tracked how?");
    expect($('[data-item="m3"] [data-kind="approval"]')?.textContent).toContain("Sends mail");
    expect($('[data-item="m4"] [data-kind="input"] input[type="password"]')).not.toBeNull();
    // A message renders no element of its own: its parts sit directly in the partner's wrapper.
    expect($('[data-item="m1"]')?.children.length).toBe(1);
  });

  test("the fallback choice answers its own tool call with the picked labels", async () => {
    const server = makeServer();
    await render(<Base44ChatProvider appId={app} server={server}><Messages /></Base44ChatProvider>);
    await snapshot(conversation);
    const weekly = [...container.querySelectorAll<HTMLInputElement>('[data-item="m2"] input[type="radio"]')][1];
    await click(weekly);
    await click(button('[data-item="m2"]', "Send answer"));
    expect(server.submitToolCallInput).toHaveBeenCalledWith(app, {
      toolCallId: "t1", messageId: "m2", approve: true, extraUserInput: { answers: [{ question_index: 0, selected_labels: ["Weekly"] }] },
    });
    expect($('[data-item="m2"] [data-kind="choice"]')).toBeNull();
  });

  test("the fallback input submits secrets and the fallback approval declines its own call", async () => {
    const server = makeServer();
    await render(<Base44ChatProvider appId={app} server={server}><Messages /></Base44ChatProvider>);
    await snapshot(conversation);
    await type($('[data-item="m4"] input[type="password"]') as HTMLInputElement, "secret");
    await click(button('[data-item="m4"]', "Save"));
    expect(server.submitToolCallInput).toHaveBeenCalledWith(app, { toolCallId: "t3", messageId: "m4", approve: true, extraUserInput: { secrets: { API_KEY: "secret" } } });
    await click(button('[data-item="m3"]', "Decline"));
    expect(server.submitToolCallInput).toHaveBeenLastCalledWith(app, { toolCallId: "t2", messageId: "m3", approve: false, extraUserInput: undefined });
  });

  test("<Message> also works over the bare hook, without a provider", async () => {
    function Bare() {
      const chat = useBase44Chat({ appId: app, server: makeServer() });
      return <>{chat.items.map(item => <Message key={item.id} item={item} />)}</>;
    }
    await render(<Bare />);
    await snapshot([message("m1", "1", { content: "hello" })]);
    expect($('[data-base44="text"]')?.textContent).toBe("hello");
  });
});

describe("replaced parts", () => {
  test("replaced parts draw, the rest fall back, and a question part gets its bound actions", async () => {
    const server = makeServer();
    const Step = ({ label }: StepProps) => <i data-test="step">{label}</i>;
    const Approval = ({ action, approve }: ApprovalQuestion) => <button data-test="allow" onClick={() => void approve()}>{action}</button>;
    await render(<Base44ChatProvider appId={app} server={server} components={{ message: { Step }, question: { Approval } }}><Messages /></Base44ChatProvider>);
    await snapshot(conversation);
    expect([...container.querySelectorAll('[data-test="step"]')].map(s => s.textContent)).toContain("write_file src/App.jsx");
    expect($('[data-base44="step"]')).toBeNull();
    expect($('[data-item="m1"] [data-base44="text"]')).not.toBeNull();
    expect($('[data-item="m2"] [data-kind="choice"]')).not.toBeNull();
    await click($('[data-test="allow"]'));
    expect(server.submitToolCallInput).toHaveBeenCalledWith(app, { toolCallId: "t2", messageId: "m3", approve: true, extraUserInput: undefined });
  });
});

describe("reading the chat", () => {
  test("the reading hooks fail clearly outside a provider", async () => {
    const errors: string[] = [];
    function Outside() {
      for (const read of [useChatState, useChatActions]) {
        try { read(); } catch (e) { errors.push((e as Error).message); }
      }
      return null;
    }
    await render(<Outside />);
    expect(errors).toEqual(["useChatState needs a <Base44ChatProvider> above it", "useChatActions needs a <Base44ChatProvider> above it"]);
  });

  test("state readers re-render on events, action readers do not", async () => {
    const renders = { state: 0, actions: 0 };
    function StateReader() { renders.state++; useChatState(); return null; }
    function ActionsReader() { renders.actions++; useChatActions(); return null; }
    await render(<Base44ChatProvider appId={app} server={makeServer()}><StateReader /><ActionsReader /></Base44ChatProvider>);
    const before = { ...renders };
    await snapshot([message("m1", "1", { content: "one" })]);
    await event({ type: "message.updated", appId: app, data: { message: message("m2", "2", { content: "two" }) } });
    expect(renders.state).toBeGreaterThan(before.state);
    expect(renders.actions).toBe(before.actions);
  });

  test("inline server, callback and parts keep the actions and the parts stable", async () => {
    const renders = { actions: 0, parts: 0 };
    const seen = new Set<unknown>();
    const ActionsReader = memo(function ActionsReader() { renders.actions++; seen.add(useChatActions()); return null; });
    const PartsReader = memo(function PartsReader() { renders.parts++; seen.add(useChatComponents()); return null; });
    const Step = ({ label }: StepProps) => <i>{label}</i>;
    const server = makeServer();
    const tree = (n: number, props: Partial<Base44ChatProviderProps> = {}) => (
      <Base44ChatProvider appId={app} server={{ ...server }} onAppCreated={() => void n} components={{ message: { Step } }} {...props}>
        <ActionsReader />
        <PartsReader />
      </Base44ChatProvider>
    );
    await render(tree(1));
    await render(tree(2));
    await render(tree(3));
    expect(renders).toEqual({ actions: 1, parts: 1 });
    expect(seen.size).toBe(2);
    // A part that really changes does reach the readers.
    await render(tree(4, { components: { message: { Step: ({ label }: StepProps) => <b>{label}</b> } } }));
    expect(renders.parts).toBe(2);
    expect(renders.actions).toBe(1);
  });

  test("actions from context reach the latest server and callback", async () => {
    const first = makeServer(), second = makeServer();
    const onAppCreated = vi.fn();
    let actions!: ReturnType<typeof useChatActions>;
    function Grab() { actions = useChatActions(); return null; }
    await render(<Base44ChatProvider appId={null} server={first} onAppCreated={() => {}}><Grab /></Base44ChatProvider>);
    await render(<Base44ChatProvider appId={null} server={second} onAppCreated={onAppCreated}><Grab /></Base44ChatProvider>);
    await act(async () => { await actions.create("A tiny app"); });
    expect(first.createApp).not.toHaveBeenCalled();
    expect(second.createApp).toHaveBeenCalledWith("A tiny app");
    expect(onAppCreated).toHaveBeenCalledWith({ id: "b".repeat(24), name: "A tiny app" });
  });
});
