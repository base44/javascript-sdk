import { describe, expect, test, vi } from "vitest";
import type { Message } from "../../../src/client/modules/chat.events.generated.js";
import type { ToolCall } from "../../../src/client/modules/chat.events.types.js";
import { toQuestion, isWaitingForUser, mergeMessage, mergeSnapshot, pendingPromptItems, settlePendingPrompts, SNAPSHOT_SIZE, sortMessages, stepStatus, toItems, toUtcTimestamp, unknownKindToolCalls, waitingToolCallIds } from "../../../src/react/chat-items.js";

const message = (id: string, created: string, extra: Partial<Message> = {}): Message => ({ id, role: "assistant", metadata: { created_date: created }, ...extra });
const waiting = (id: string, extra: Partial<ToolCall> = {}): ToolCall => ({ id, name: "tool", status: "waiting_for_user_input", ...extra });

describe("ordering", () => {
  test("messages sort by created_date and a missing date sorts first", () => {
    const sorted = sortMessages([message("b", "2026-01-02"), message("a", "2026-01-01"), message("none", "")]);
    expect(sorted.map(m => m.id)).toEqual(["none", "a", "b"]);
  });

  test("an update replaces the message with the same id in place and a new one goes last", () => {
    const all = [message("a", "1"), message("b", "2")];
    expect(mergeMessage(all, message("a", "1", { content: "edited" })).map(m => [m.id, m.content])).toEqual([["a", "edited"], ["b", undefined]]);
    expect(mergeMessage(all, message("c", "3")).map(m => m.id)).toEqual(["a", "b", "c"]);
  });
});

describe("snapshots", () => {
  const at = (i: number) => `2026-10-16T10:${String(i).padStart(2, "0")}:00Z`;
  const range = (from: number, to: number, extra: Partial<Message> = {}) =>
    Array.from({ length: to - from }, (_, i) => message(`m${from + i}`, at(from + i), extra));

  test("a full snapshot is the truth for its window, and the messages before it stay", () => {
    const held = range(0, 60);
    const snapshot = range(10, 10 + SNAPSHOT_SIZE, { content: "fresh" }).filter(m => m.id !== "m30");
    snapshot.push(message("m60", at(60)));
    const merged = sortMessages(mergeSnapshot(held, snapshot));
    expect(merged.map(m => m.id)).toEqual([...range(0, 60).map(m => m.id).filter(id => id !== "m30"), "m60"]);
    expect(merged.slice(0, 10).every(m => m.content === undefined)).toBe(true);
    expect(merged.slice(10, 20).every(m => m.content === "fresh")).toBe(true);
  });

  test("a snapshot with room to spare holds the whole conversation", () => {
    expect(mergeSnapshot(range(0, 60), range(55, 60)).map(m => m.id)).toEqual(["m55", "m56", "m57", "m58", "m59"]);
  });
});

describe("items", () => {
  test("text, role, time, and each step's tool, files, label and status come straight from the message", () => {
    const tools: ToolCall[] = [
      { id: "t1", name: "write_file", status: "success", display: { file_paths: ["src/App.jsx", "src/index.css"] } },
      { id: "t2", name: "run", status: "running" },
      { id: "t3", name: "run", status: "error" },
      { id: "t4", name: "run", status: "stopped" },
    ];
    const [item] = toItems([message("m", "2026-10-14T10:00:00.123456", { role: "user", content: "hi", tool_calls: tools })], [], vi.fn());
    expect(item).toMatchObject({ id: "m", role: "user", text: "hi", createdAt: "2026-10-14T10:00:00.123Z" });
    expect(item.steps[0]).toEqual({ id: "t1", tool: "write_file", files: ["src/App.jsx", "src/index.css"], label: "write_file src/App.jsx src/index.css", status: "done" });
    expect(item.steps.map(s => [s.label, s.status])).toEqual([["write_file src/App.jsx src/index.css", "done"], ["run", "running"], ["run", "error"], ["run", "stopped"]]);
    expect(item.steps.every(s => !("question" in s))).toBe(true);
  });

  test("an unknown role is rendered as the assistant, and missing fields as empty", () => {
    const [item] = toItems([{ id: "m", role: "system" as Message["role"] }], [], vi.fn());
    expect(item).toEqual({ id: "m", role: "assistant", text: "", createdAt: "", steps: [], pending: false });
    const [step] = toItems([message("m", "1", { tool_calls: [{ id: "t" }] })], [], vi.fn())[0].steps;
    expect(step).toEqual({ id: "t", tool: "", files: [], label: "", status: "done" });
  });

  test("several waiting steps in the last message each carry their own question, bound to its own ids", async () => {
    const respond = vi.fn(async () => {});
    const [item] = toItems(
      [message("m", "1", { tool_calls: [waiting("t1", { waiting_on: { kind: "approval" } }), waiting("t2", { waiting_on: { kind: "choice" } }), { id: "t3", status: "success" }, waiting("t4", { waiting_on: { kind: "input" } })] })],
      [],
      respond,
    );
    expect(item.steps.map(s => s.question?.kind)).toEqual(["approval", "choice", undefined, "secrets"]);
    await item.steps[1].question!.decline();
    expect(respond).toHaveBeenLastCalledWith("t2", "m", false, undefined);
    await (item.steps[0].question as { approve(): Promise<void> }).approve();
    expect(respond).toHaveBeenLastCalledWith("t1", "m", true, undefined);
  });

  test("questions are answerable only in the last assistant message, the one that makes the chat wait", () => {
    const sorted = [
      message("a1", "1", { tool_calls: [waiting("t1", { waiting_on: { kind: "approval" } })] }),
      message("a2", "2", { tool_calls: [waiting("t2", { waiting_on: { kind: "approval" } }), waiting("t3", { waiting_on: { kind: "choice" } })] }),
      message("u1", "3", { role: "user" }),
      message("a3", "4", { tool_calls: [waiting("t4", { waiting_on: { kind: "choice" } }), waiting("t5", { waiting_on: { kind: "input" } })] }),
    ];
    const items = toItems(sorted, [], vi.fn());
    expect(items.map(i => i.steps.map(s => [s.status, s.question?.kind]))).toEqual([
      [["waiting", undefined]],
      [["waiting", undefined], ["waiting", undefined]],
      [],
      [["waiting", "choice"], ["waiting", "secrets"]],
    ]);
  });

  test("a notice that expects no reply is skipped when finding the last assistant message", () => {
    const sorted = [
      message("a1", "1", { tool_calls: [waiting("t1", { waiting_on: { kind: "approval" } })] }),
      message("n1", "2", { additional_message_params: { skip_ai_response: true } }),
    ];
    expect(toItems(sorted, [], vi.fn())[0].steps[0].question?.kind).toBe("approval");
  });

  test("an answered step loses its question, even while the server still reports it waiting", () => {
    const [item] = toItems([message("m", "1", { tool_calls: [waiting("t1", { waiting_on: { kind: "approval" } }), waiting("t2", { waiting_on: { kind: "approval" } })] })], ["t1"], vi.fn());
    expect(item.steps.map(s => [s.status, s.question?.kind])).toEqual([["waiting", undefined], ["waiting", "approval"]]);
  });

  test("a kind this release doesn't know has no question, and is listed for declining only on the last message", () => {
    const old = message("m0", "0", { tool_calls: [waiting("t0", { waiting_on: { kind: "plan" as "approval" } })] });
    const last = message("m", "2", { tool_calls: [waiting("t1", { waiting_on: { kind: "plan" as "approval" } }), waiting("t2"), waiting("t3", { waiting_on: { kind: "choice" } })] });
    const sorted = [old, message("u", "1", { role: "user" }), last];
    const steps = toItems(sorted, [], vi.fn())[2].steps;
    expect(steps.map(s => [s.status, s.question?.kind])).toEqual([["waiting", undefined], ["waiting", undefined], ["waiting", "choice"]]);
    // A call with no kind comes only from old messages: it is left alone.
    expect(unknownKindToolCalls(sorted)).toEqual([{ toolCallId: "t1", messageId: "m" }]);
    expect(waitingToolCallIds(sorted)).toEqual(new Set(["t0", "t1", "t2", "t3"]));
  });

  test("the chat waits only on the last assistant message, as in Base44's app editor", () => {
    const sorted = [message("m1", "1", { tool_calls: [{ id: "t0", status: "running" }] }), message("m2", "2", { tool_calls: [waiting("t1"), waiting("t2")] })];
    expect(isWaitingForUser(sorted, [])).toBe(true);
    expect(isWaitingForUser(sorted, ["t1"])).toBe(true);
    expect(isWaitingForUser(sorted, ["t1", "t2"])).toBe(false);
    expect(isWaitingForUser([message("m", "1")], [])).toBe(false);
    // An old call left waiting in an earlier turn doesn't hold the chat.
    expect(isWaitingForUser([message("m1", "1", { tool_calls: [waiting("t1")] }), message("u", "2", { role: "user" }), message("m2", "3")], [])).toBe(false);
    // A notice that expects no reply is skipped.
    expect(isWaitingForUser([message("m1", "1", { tool_calls: [waiting("t1")] }), message("n", "2", { additional_message_params: { skip_ai_response: true } })], [])).toBe(true);
  });
});

describe("steps", () => {
  const step = (toolCall: Record<string, unknown>) => toItems([message("m", "1", { tool_calls: [toolCall as ToolCall] })], [], vi.fn())[0].steps[0];

  test("a step's label is Base44's summary, then the entity it touched, then the tool and files", () => {
    expect(step({ id: "t1", name: "run_shell_command", status: "success", display: { summary: "Installed the date library" } }))
      .toMatchObject({ label: "Installed the date library" });
    expect(step({ id: "t2", name: "update_entities", status: "success", arguments: { summary: "Marked three tasks done" }, display: { entity_name: "Task" } }))
      .toMatchObject({ label: "Marked three tasks done" });
    expect(step({ id: "t3", name: "delete_entities", status: "success", display: { entity_name: "Task", record_count: 3 } }))
      .toMatchObject({ label: "delete_entities Task (3)" });
    expect(step({ id: "t4", name: "write_file", status: "success", display: { file_paths: ["src/App.jsx"] } }).label).toBe("write_file src/App.jsx");
  });

  test("a 'present | past' summary shows the half that matches the step, as in Base44's builder", () => {
    const summary = "Looking at your app | Looked at your app";
    expect(step({ id: "t1", name: "exec_tool", status: "running", display: { summary } }).label).toBe("Looking at your app");
    expect(step({ id: "t2", name: "exec_tool", status: "waiting_for_user_input", display: { summary } }).label).toBe("Looking at your app");
    expect(step({ id: "t3", name: "exec_tool", status: "success", display: { summary } }).label).toBe("Looked at your app");
    expect(step({ id: "t4", name: "exec_tool", status: "error", display: { summary } }).label).toBe("Looked at your app");
  });

  test("an answered choice keeps what the user answered, next to each question", () => {
    const answered = step({
      id: "t1",
      name: "ask_clarifying_questions",
      status: "success",
      arguments: { questions: [{ question: "Which colour?" }, { question: "Which pages?", multi_select: true }, { question: "Name it" }] },
      user_input: { answers: [
        { question_index: 0, selected_label: "Blue", custom_text: "a calm one" },
        { question_index: 1, selected_labels: ["Home", "About"] },
        { question_index: 2, custom_text: "Sip" },
      ] },
    });
    expect(answered.answered).toEqual([
      { question: "Which colour?", labels: ["Blue"], text: "a calm one" },
      { question: "Which pages?", labels: ["Home", "About"] },
      { question: "Name it", labels: [], text: "Sip" },
    ]);
    expect(answered.question).toBeUndefined();
  });
});

describe("timestamps", () => {
  test("Base44's zoneless UTC gets its Z, in the shape a pending prompt has", () => {
    expect(toUtcTimestamp("2026-10-25T11:00:00")).toBe("2026-10-25T11:00:00.000Z");
    expect(toUtcTimestamp("2026-10-25T11:00:00.123456")).toBe("2026-10-25T11:00:00.123Z");
    expect(toUtcTimestamp(new Date(Date.UTC(2026, 9, 25, 11)).toISOString())).toBe("2026-10-25T11:00:00.000Z");
  });

  test("a zone already there is kept, and what doesn't parse is left as it is", () => {
    expect(toUtcTimestamp("2026-10-25T11:00:00Z")).toBe("2026-10-25T11:00:00.000Z");
    expect(toUtcTimestamp("2026-10-25T14:00:00+03:00")).toBe("2026-10-25T11:00:00.000Z");
    expect(toUtcTimestamp("1")).toBe("1");
    expect(toUtcTimestamp(undefined)).toBe("");
    expect(toUtcTimestamp(null)).toBe("");
  });
});

describe("pending prompts", () => {
  const pending = (id: string, content: string, appId = "a") => ({ id, content, createdAt: "", appId });

  test("an arrival settles the pending prompt with its text, of its own app, ignoring outer spaces", () => {
    const all = [pending("p1", "one"), pending("p2", "two"), pending("p3", "two", "b")];
    expect(settlePendingPrompts(all, "a", [" two "], false).map(p => p.id)).toEqual(["p1", "p3"]);
    expect(settlePendingPrompts(all, "a", ["three"], false).map(p => p.id)).toEqual(["p1", "p2", "p3"]);
  });

  test("an arrival that matches none, such as another client's prompt, settles nothing", () => {
    expect(settlePendingPrompts([pending("p1", "one"), pending("p2", "two")], "a", ["someone else's"]).map(p => p.id)).toEqual(["p1", "p2"]);
  });

  test("a pending prompt is a user item with no steps", () => {
    expect(pendingPromptItems([{ id: "p1", content: "hi", createdAt: "t", appId: "a" }])).toEqual([
      { id: "p1", role: "user", text: "hi", createdAt: "t", steps: [], pending: true },
    ]);
  });
});


describe("questions", () => {
  test("choice: questions, options as strings or objects, multi, and answers keyed by position", async () => {
    const reply = vi.fn(async () => {});
    const question = toQuestion(
      waiting("t", {
        waiting_on: { kind: "choice" },
        arguments: {
          questions: [
            { question: "Which?", description: "Pick one", options: ["A", { label: "B" }, {}], multi_select: false },
            { question: "Extras?", options: ["X", "Y"], multi_select: true },
            { question: "Name it", type: "text_input" },
          ],
        },
      }),
      reply,
    );
    expect(question?.kind).toBe("choice");
    if (question?.kind !== "choice") return;
    expect(question.questions).toEqual([
      { text: "Which?", description: "Pick one", type: undefined, options: ["A", "B", ""], multi: false },
      { text: "Extras?", description: undefined, type: undefined, options: ["X", "Y"], multi: true },
      { text: "Name it", description: undefined, type: "text_input", options: [], multi: false },
    ]);
    // As in Base44's app editor: one pick in selected_label, several in selected_labels.
    await question.answer([["A"], ["X", "Y"]]);
    expect(reply).toHaveBeenCalledWith(true, {
      answers: [
        { question_index: 0, selected_label: "A" },
        { question_index: 1, selected_labels: ["X", "Y"] },
      ],
    });
    await question.answer([[], ["Y"]]);
    expect(reply).toHaveBeenLastCalledWith(true, { answers: [{ question_index: 1, selected_labels: ["Y"] }] });
    // Free text answers a text_input question, or rides beside a pick; blank text is no answer.
    await question.answer([["B"], [], []], ["  make it warmer ", "", "Sip"]);
    expect(reply).toHaveBeenLastCalledWith(true, {
      answers: [
        { question_index: 0, selected_label: "B", custom_text: "make it warmer" },
        { question_index: 2, custom_text: "Sip" },
      ],
    });
    await question.decline();
    expect(reply).toHaveBeenLastCalledWith(false);
  });

  test("secrets: Base44's input kind, fields from secrets_schema, submitted as secrets", async () => {
    const reply = vi.fn(async () => {});
    const question = toQuestion(
      waiting("t", { waiting_on: { kind: "input" }, arguments: { secrets_schema: [{ secretName: "API_KEY", description: "From the dashboard" }, {}] } }),
      reply,
    );
    expect(question?.kind).toBe("secrets");
    if (question?.kind !== "secrets") return;
    expect(question.fields).toEqual([{ name: "API_KEY", description: "From the dashboard" }, { name: "", description: undefined }]);
    await question.submit({ API_KEY: "secret" });
    expect(reply).toHaveBeenCalledWith(true, { secrets: { API_KEY: "secret" } });
    await question.decline();
    expect(reply).toHaveBeenLastCalledWith(false);
  });

  test("approval: the tool name, and the guard's reason or its summary", async () => {
    const reply = vi.fn(async () => {});
    const withReason = toQuestion(waiting("t", { name: "send_email", waiting_on: { kind: "approval" }, approval: { guard: "g", reason: "Sends mail" } }), reply);
    expect(withReason).toMatchObject({ kind: "approval", action: "send_email", reason: "Sends mail" });
    const withSummary = toQuestion(waiting("t", { name: "bash", waiting_on: { kind: "approval" }, approval: { guard: "g", details: { summary: "Lists files" } } }), reply);
    expect(withSummary).toMatchObject({ kind: "approval", reason: "Lists files" });
    const guarded = toQuestion(waiting("t", {
      name: "update_entity_rules",
      waiting_on: { kind: "approval" },
      approval: { guard: "entity_rls_guard", reason: "Opens Task to everyone", details: { entity_name: "Task", change_type: "loosen", changed_ops: ["read", "update"] } },
    } as Partial<ToolCall>), reply);
    expect(guarded).toMatchObject({
      guard: "entity_rls_guard",
      details: { entityName: "Task", changeType: "loosen", changedOps: ["read", "update"] },
    });
    const bare = toQuestion(waiting("t", { waiting_on: { kind: "approval" } }), reply);
    expect(bare).toMatchObject({ guard: "", details: {} });
    expect(bare).toMatchObject({ kind: "approval", action: "tool", reason: "" });
    if (bare?.kind !== "approval") return;
    await bare.approve();
    expect(reply).toHaveBeenCalledWith(true);
  });

  test("a kind this release does not know, or none, has no question", () => {
    expect(toQuestion(waiting("t", { waiting_on: { kind: "plan" as "approval" } }), vi.fn())).toBeUndefined();
    expect(toQuestion(waiting("t"), vi.fn())).toBeUndefined();
  });

  test("Base44's tool call statuses map to five step states", () => {
    expect(stepStatus({ status: "running" })).toBe("running");
    expect(stepStatus({ status: "waiting_for_user_input" })).toBe("waiting");
    expect(stepStatus({ status: "success" })).toBe("done");
    expect(stepStatus({ status: "stopped" })).toBe("stopped");
    expect(stepStatus({ status: "error" })).toBe("error");
    expect(stepStatus({})).toBe("done");
  });
});
