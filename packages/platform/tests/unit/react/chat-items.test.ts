import { describe, expect, test, vi } from "vitest";
import type { ChatMessage, ToolCall } from "../../../src/modules/builder.events.types.js";
import { bindQuestion, mergeMessage, sortMessages, stepStatus, toItems } from "../../../src/react/chat-items.js";

const message = (id: string, created: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({ id, role: "assistant", metadata: { created_date: created }, ...extra });
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

describe("items", () => {
  test("text, role, steps and their statuses come straight from the message", () => {
    const tools: ToolCall[] = [
      { id: "t1", name: "write_file", status: "success", display: { file_paths: ["src/App.jsx"] } },
      { id: "t2", name: "run", status: "running" },
      { id: "t3", name: "run", status: "error" },
      { id: "t4", name: "run", status: "stopped" },
    ];
    const [item] = toItems([message("m", "1", { role: "user", content: "hi", tool_calls: tools })], [], vi.fn());
    expect(item.role).toBe("user");
    expect(item.text).toBe("hi");
    expect(item.steps.map(s => [s.label, s.status])).toEqual([["write_file src/App.jsx", "done"], ["run", "running"], ["run", "error"], ["run", "done"]]);
    expect(item.question).toBeUndefined();
  });

  test("an unknown role is rendered as the assistant and missing content as empty text", () => {
    const [item] = toItems([message("m", "1", { role: "system" as ChatMessage["role"] })], [], vi.fn());
    expect(item.role).toBe("assistant");
    expect(item.text).toBe("");
    expect(item.steps).toEqual([]);
  });

  test("each waiting tool call becomes the question of its own message, bound to its own ids", async () => {
    const respond = vi.fn(async () => {});
    const items = toItems(
      [
        message("m1", "1", { tool_calls: [waiting("t1", { waiting_on: { kind: "approval" } })] }),
        message("m2", "2", { tool_calls: [waiting("t2", { waiting_on: { kind: "approval" } })] }),
      ],
      [],
      respond,
    );
    expect(items.map(i => i.question?.kind)).toEqual(["approval", "approval"]);
    await items[1].question!.decline();
    expect(respond).toHaveBeenCalledWith("t2", "m2", false, undefined);
    await (items[0].question as { approve(): Promise<void> }).approve();
    expect(respond).toHaveBeenCalledWith("t1", "m1", true, undefined);
  });

  test("an answered tool call is no longer a question, even while the server still reports it waiting", () => {
    const [item] = toItems([message("m", "1", { tool_calls: [waiting("t1")] })], ["t1"], vi.fn());
    expect(item.question).toBeUndefined();
    expect(item.steps[0].status).toBe("waiting");
  });
});

describe("questions", () => {
  test("choice: questions, options as strings or objects, multi, and answers keyed by position", async () => {
    const reply = vi.fn(async () => {});
    const question = bindQuestion(
      waiting("t", {
        waiting_on: { kind: "choice" },
        arguments: {
          questions: [
            { question: "Which?", description: "Pick one", options: ["A", { label: "B" }, {}], multi_select: false },
            { question: "Extras?", options: ["X", "Y"], multi_select: true },
          ],
        },
      }),
      reply,
    );
    expect(question.kind).toBe("choice");
    if (question.kind !== "choice") return;
    expect(question.questions).toEqual([
      { text: "Which?", description: "Pick one", options: ["A", "B", ""], multi: false },
      { text: "Extras?", description: undefined, options: ["X", "Y"], multi: true },
    ]);
    await question.answer([["A"], ["X", "Y"]]);
    expect(reply).toHaveBeenCalledWith(true, {
      answers: [
        { question_index: 0, selected_labels: ["A"] },
        { question_index: 1, selected_labels: ["X", "Y"] },
      ],
    });
    await question.answer([[], ["Y"]]);
    expect(reply).toHaveBeenLastCalledWith(true, { answers: [{ question_index: 1, selected_labels: ["Y"] }] });
    await question.decline();
    expect(reply).toHaveBeenLastCalledWith(false);
  });

  test("input: fields from secrets_schema, submitted as secrets", async () => {
    const reply = vi.fn(async () => {});
    const question = bindQuestion(
      waiting("t", { waiting_on: { kind: "input" }, arguments: { secrets_schema: [{ secretName: "API_KEY", description: "From the dashboard" }, {}] } }),
      reply,
    );
    expect(question.kind).toBe("input");
    if (question.kind !== "input") return;
    expect(question.fields).toEqual([{ name: "API_KEY", description: "From the dashboard" }, { name: "", description: undefined }]);
    await question.submit({ API_KEY: "secret" });
    expect(reply).toHaveBeenCalledWith(true, { secrets: { API_KEY: "secret" } });
  });

  test("approval: the tool name, and the guard's reason or its summary", async () => {
    const reply = vi.fn(async () => {});
    const withReason = bindQuestion(waiting("t", { name: "send_email", waiting_on: { kind: "approval" }, approval: { guard: "g", reason: "Sends mail" } }), reply);
    expect(withReason).toMatchObject({ kind: "approval", action: "send_email", reason: "Sends mail" });
    const withSummary = bindQuestion(waiting("t", { name: "bash", waiting_on: { kind: "approval" }, approval: { guard: "g", details: { summary: "Lists files" } } }), reply);
    expect(withSummary).toMatchObject({ kind: "approval", reason: "Lists files" });
    const bare = bindQuestion(waiting("t", { waiting_on: { kind: "approval" } }), reply);
    expect(bare).toMatchObject({ kind: "approval", action: "tool", reason: "" });
    if (bare.kind !== "approval") return;
    await bare.approve();
    expect(reply).toHaveBeenCalledWith(true);
  });

  test("a kind this release does not know can only be declined", async () => {
    const reply = vi.fn(async () => {});
    const question = bindQuestion(waiting("t", { name: "new_tool", waiting_on: { kind: "plan" as "approval" } }), reply);
    expect(question).toMatchObject({ kind: "unknown", action: "new_tool" });
    expect("approve" in question).toBe(false);
    await question.decline();
    expect(reply).toHaveBeenCalledWith(false);
  });

  test("statuses map to four step states", () => {
    expect(stepStatus({ status: "running" })).toBe("running");
    expect(stepStatus({ status: "waiting_for_user_input" })).toBe("waiting");
    expect(stepStatus({ status: "error" })).toBe("error");
    expect(stepStatus({ status: "success" })).toBe("done");
    expect(stepStatus({})).toBe("done");
  });
});
