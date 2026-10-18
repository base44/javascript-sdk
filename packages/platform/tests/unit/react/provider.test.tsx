// @vitest-environment jsdom
import { act, memo } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Message as BaseMessage } from "../../../src/client/modules/builder.events.generated.js";
import type { PlatformSnapshot } from "../../../src/client/modules/builder.events.types.js";
import type { SocketSession } from "../../../src/client/modules/builder.types.js";
import {
  Base44ChatProvider, Message, Question, useChatActions, useChatState,
  type ApprovalQuestion, type Base44ChatBackend, type Base44ChatProviderProps, type ChoiceQuestion, type QuestionComponents, type SecretsQuestion, type StepProps,
} from "../../../src/react/index.js";

// The platform client is replaced by a recorder, as in the hook's own test.
type Sub = { onSnapshot(s: PlatformSnapshot): unknown; onEvent(e: unknown): unknown; onError(e: unknown): void };
const fake = vi.hoisted(() => ({ subs: [] as Record<string, Sub>[] }));
vi.mock("../../../src/client/client.js", () => ({
  createPlatformClient: () => ({
    builder: {
      init() {
        const subs: Record<string, Sub> = {};
        fake.subs.push(subs);
        return { connect: async () => {}, close() {}, subscribe(appId: string, opts: Sub) { subs[appId] = opts; return { appId, active: true, unsubscribe() {} }; } };
      },
    },
  }),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const app = "a".repeat(24);
const message = (id: string, created: string, extra: Partial<BaseMessage> = {}): BaseMessage => ({ id, role: "assistant", metadata: { created_date: created }, ...extra });
const makeBackend = () => ({
  createApp: vi.fn(async (prompt: string) => ({ id: "b".repeat(24), name: prompt })),
  openLiveSession: vi.fn(async (): Promise<SocketSession> => ({ session_token: "token", socket_url: "https://socket.test", socket_path: "/ws/socket.io/" })),
  sendMessage: vi.fn(async () => {}),
  submitToolCallInput: vi.fn(async () => {}),
}) satisfies Base44ChatBackend;

// Only the last assistant message makes the chat wait, so it holds all three questions.
const conversation: BaseMessage[] = [
  message("m1", "1", { role: "user", content: "A habit app" }),
  message("m2", "2", {
    content: "A few things first.",
    tool_calls: [
      { id: "t0", name: "write_file", status: "success", display: { file_paths: ["src/App.jsx"] } },
      { id: "t1", name: "ask_clarifying_questions", status: "waiting_for_user_input", waiting_on: { kind: "choice" }, arguments: { questions: [{ question: "Tracked how?", options: ["Daily", { label: "Weekly" }] }] } },
      { id: "t2", name: "send_email", status: "waiting_for_user_input", waiting_on: { kind: "approval" }, approval: { guard: "g", reason: "Sends mail" } },
      { id: "t3", name: "set_secrets", status: "waiting_for_user_input", waiting_on: { kind: "input" }, arguments: { secrets_schema: [{ secretName: "API_KEY" }] } },
    ],
  } as Partial<BaseMessage>),
];

// The partner's question parts: each answers through the actions it was given.
const questionParts: QuestionComponents = {
  Choice: ({ questions, answer }: ChoiceQuestion) => <button data-part="choice" onClick={() => void answer([[questions[0].options[1]]])}>{questions[0].text}</button>,
  Secrets: ({ fields, submit }: SecretsQuestion) => <button data-part="secrets" onClick={() => void submit({ [fields[0].name]: "secret" })}>{fields[0].name}</button>,
  Approval: ({ action, reason, decline }: ApprovalQuestion) => <button data-part="approval" onClick={() => void decline()}>{`${action}: ${reason}`}</button>,
};

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
const snapshot = (messages: BaseMessage[]) => act(async () => { await fake.subs.at(-1)![app].onSnapshot({ status: { state: "ready" }, messages } as PlatformSnapshot); });
const event = (e: unknown) => act(async () => { await fake.subs.at(-1)![app].onEvent(e); });
const $ = (selector: string) => container.querySelector<HTMLElement>(selector);
const click = (el: Element | null) => act(async () => { (el as HTMLElement).click(); });

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

describe("drawing a message", () => {
  test("text, then each step followed by its own question, with no element of its own", async () => {
    await render(<Base44ChatProvider appId={app} backend={makeBackend()} components={{ question: questionParts }}><Messages /></Base44ChatProvider>);
    await snapshot(conversation);
    const drawn = [...($('[data-item="m2"]')?.children ?? [])].map(el => el.getAttribute("data-base44") ?? `part:${el.getAttribute("data-part")}`);
    expect(drawn).toEqual(["text", "step", "step", "part:choice", "step", "part:approval", "step", "part:secrets"]);
    expect($('[data-item="m1"] [data-base44="text"]')?.dataset.role).toBe("user");
    const steps = [...container.querySelectorAll<HTMLElement>('[data-item="m2"] [data-base44="step"]')];
    expect(steps.map(step => [step.textContent, step.dataset.status])).toEqual([
      ["write_file src/App.jsx", "done"], ["ask_clarifying_questions", "waiting"], ["send_email", "waiting"], ["set_secrets", "waiting"],
    ]);
    expect($('[data-part="approval"]')?.textContent).toBe("send_email: Sends mail");
  });

  test("each question part answers its own tool call", async () => {
    const backend = makeBackend();
    await render(<Base44ChatProvider appId={app} backend={backend} components={{ question: questionParts }}><Messages /></Base44ChatProvider>);
    await snapshot(conversation);
    await click($('[data-part="choice"]'));
    expect(backend.submitToolCallInput).toHaveBeenLastCalledWith(app, {
      toolCallId: "t1", messageId: "m2", approve: true, extraUserInput: { answers: [{ question_index: 0, selected_labels: ["Weekly"] }] },
    });
    expect($('[data-part="choice"]')).toBeNull();
    await click($('[data-part="secrets"]'));
    expect(backend.submitToolCallInput).toHaveBeenLastCalledWith(app, { toolCallId: "t3", messageId: "m2", approve: true, extraUserInput: { secrets: { API_KEY: "secret" } } });
    await click($('[data-part="approval"]'));
    expect(backend.submitToolCallInput).toHaveBeenLastCalledWith(app, { toolCallId: "t2", messageId: "m2", approve: false, extraUserInput: undefined });
  });

  test("replaced message parts draw instead of the fallbacks", async () => {
    const Step = ({ label }: StepProps) => <i data-part="step">{label}</i>;
    await render(<Base44ChatProvider appId={app} backend={makeBackend()} components={{ message: { Step }, question: questionParts }}><Messages /></Base44ChatProvider>);
    await snapshot(conversation);
    expect([...container.querySelectorAll('[data-part="step"]')].map(step => step.textContent)).toContain("write_file src/App.jsx");
    expect($('[data-base44="step"]')).toBeNull();
    expect($('[data-item="m1"] [data-base44="text"]')).not.toBeNull();
  });

  test("a sent prompt draws as pending until Base44 has it", async () => {
    let actions!: ReturnType<typeof useChatActions>;
    function Grab() { actions = useChatActions(); return null; }
    await render(<Base44ChatProvider appId={app} backend={makeBackend()} components={{ question: questionParts }}><Messages /><Grab /></Base44ChatProvider>);
    await snapshot([]);
    await act(async () => { await actions.send("Add a streak"); });
    expect($('[data-base44="text"]')?.dataset.pending).toBe("true");
    await event({ type: "message.updated", appId: app, data: { message: message("m9", "9", { role: "user", content: "Add a streak" }) } });
    expect($('[data-base44="text"]')?.dataset.pending).toBeUndefined();
  });

  test("<Question> draws a question anywhere below the provider", async () => {
    function Pinned() {
      const { items } = useChatState();
      const open = items.flatMap(item => item.steps.flatMap(step => (step.question ? [step] : [])));
      return <>{open.map(step => <Question key={step.id} question={step.question!} />)}</>;
    }
    await render(<Base44ChatProvider appId={app} backend={makeBackend()} components={{ question: questionParts }}><Pinned /></Base44ChatProvider>);
    await snapshot(conversation);
    expect([...container.querySelectorAll("[data-part]")].map(el => el.getAttribute("data-part"))).toEqual(["choice", "approval", "secrets"]);
  });
});

describe("reading the chat", () => {
  test("the readers and parts fail clearly outside a provider", async () => {
    const errors: string[] = [];
    function Outside() {
      for (const read of [useChatState, useChatActions]) {
        try { read(); } catch (e) { errors.push((e as Error).message); }
      }
      return null;
    }
    await render(<Outside />);
    expect(errors).toEqual(["useChatState needs a <Base44ChatProvider> above it", "useChatActions needs a <Base44ChatProvider> above it"]);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(render(<Message item={{ id: "m", role: "user", text: "hi", createdAt: "", steps: [], pending: false }} />)).rejects.toThrow("Message needs a <Base44ChatProvider> above it");
    spy.mockRestore();
  });

  test("state readers re-render on events, action readers do not", async () => {
    const renders = { state: 0, actions: 0 };
    function StateReader() { renders.state++; useChatState(); return null; }
    function ActionsReader() { renders.actions++; useChatActions(); return null; }
    await render(<Base44ChatProvider appId={app} backend={makeBackend()} components={{ question: questionParts }}><StateReader /><ActionsReader /></Base44ChatProvider>);
    const before = { ...renders };
    await snapshot([message("m1", "1", { content: "one" })]);
    await event({ type: "message.updated", appId: app, data: { message: message("m2", "2", { content: "two" }) } });
    expect(renders.state).toBeGreaterThan(before.state);
    expect(renders.actions).toBe(before.actions);
  });

  test("an inline backend, callback and parts keep the actions and the parts stable", async () => {
    const renders = { actions: 0, parts: 0 };
    const ActionsReader = memo(function ActionsReader() { renders.actions++; useChatActions(); return null; });
    const PartsReader = memo(function PartsReader() { renders.parts++; return <Message item={{ id: "m", role: "user", text: "hi", createdAt: "", steps: [], pending: false }} />; });
    const Step = ({ label }: StepProps) => <i>{label}</i>;
    const backend = makeBackend();
    const tree = (n: number, props: Partial<Base44ChatProviderProps> = {}) => (
      <Base44ChatProvider appId={app} backend={{ ...backend }} onAppCreated={() => void n} components={{ message: { Step }, question: { ...questionParts } }} {...props}>
        <ActionsReader />
        <PartsReader />
      </Base44ChatProvider>
    );
    await render(tree(1));
    await render(tree(2));
    await render(tree(3));
    expect(renders).toEqual({ actions: 1, parts: 1 });
    // A part that really changes does reach the message.
    await render(tree(4, { components: { message: { Text: ({ text }) => <b data-part="text">{text}</b> }, question: questionParts } }));
    expect(renders.actions).toBe(1);
    expect($('[data-part="text"]')?.textContent).toBe("hi");
  });

  test("actions from context reach the latest backend and callback", async () => {
    const first = makeBackend(), second = makeBackend();
    const onAppCreated = vi.fn();
    let actions!: ReturnType<typeof useChatActions>;
    function Grab() { actions = useChatActions(); return null; }
    await render(<Base44ChatProvider appId={null} backend={first} onAppCreated={() => {}} components={{ question: questionParts }}><Grab /></Base44ChatProvider>);
    const firstActions = actions;
    await render(<Base44ChatProvider appId={null} backend={second} onAppCreated={onAppCreated} components={{ question: questionParts }}><Grab /></Base44ChatProvider>);
    expect(actions).toBe(firstActions);
    await act(async () => { await actions.create("A tiny app"); });
    expect(first.createApp).not.toHaveBeenCalled();
    expect(second.createApp).toHaveBeenCalledWith("A tiny app");
    expect(onAppCreated).toHaveBeenCalledWith({ id: "b".repeat(24), name: "A tiny app" });
  });
});
