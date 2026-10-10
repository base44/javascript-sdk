import type { ChatMessage, ToolCall, ToolQuestionArguments, ToolSecretArguments } from "../modules/builder.events.types.js";
import type { ChatItem, ChatStep, Question } from "./chat.types.js";

/** @internal Submits one reply for the tool call the question belongs to. */
export type Reply = (approve: boolean, extraUserInput?: Record<string, unknown>) => Promise<void>;

/** @internal Submits a reply for a given tool call in a given message. */
export type Respond = (toolCallId: string, messageId: string, approve: boolean, extraUserInput?: Record<string, unknown>) => Promise<void>;

/** @internal Events can arrive out of order, so messages are ordered by when they were created. */
export function sortMessages(messages: ChatMessage[]): ChatMessage[] {
  return [...messages].sort((a, b) => (a.metadata?.created_date ?? "").localeCompare(b.metadata?.created_date ?? ""));
}

/** @internal Replaces the message with the same id in place, or adds it at the end. */
export function mergeMessage(all: ChatMessage[], message: ChatMessage): ChatMessage[] {
  return all.some(m => m.id === message.id) ? all.map(m => (m.id === message.id ? message : m)) : [...all, message];
}

/** @internal Turns sorted messages into items. A tool call that waits and is not in `answered` becomes the item's question. */
export function toItems(sorted: ChatMessage[], answered: string[], respond: Respond): ChatItem[] {
  const isOpen = (tool: ToolCall) => tool.status === "waiting_for_user_input" && !answered.includes(tool.id!);
  return sorted.map(m => {
    const waiting = m.tool_calls?.find(isOpen);
    return {
      id: m.id!,
      role: m.role === "user" ? "user" : "assistant",
      text: m.content ?? "",
      steps: (m.tool_calls ?? []).map(tool => ({
        id: tool.id!,
        label: [tool.name, ...(tool.display?.file_paths ?? [])].join(" "),
        status: stepStatus(tool),
      })),
      question: waiting && bindQuestion(waiting, (approve, extra) => respond(waiting.id!, m.id!, approve, extra)),
    };
  });
}

/** @internal */
export function stepStatus(tool: ToolCall): ChatStep["status"] {
  if (tool.status === "running") return "running";
  if (tool.status === "waiting_for_user_input") return "waiting";
  if (tool.status === "error") return "error";
  return "done";
}

/** @internal Base44's question formats, as one simple shape per kind, each bound to the reply that
 * answers it. Base44 keys choice answers by position, so `picked` follows `questions`. */
export function bindQuestion(tool: ToolCall, reply: Reply): Question {
  const kind = tool.waiting_on?.kind;
  const decline = () => reply(false);
  if (kind === "choice") {
    const questions = (tool.arguments as ToolQuestionArguments | undefined)?.questions ?? [];
    return {
      kind,
      questions: questions.map(q => ({
        text: q.question ?? "",
        description: q.description,
        options: (q.options ?? []).map(o => (typeof o === "string" ? o : o.label ?? "")),
        multi: !!q.multi_select,
      })),
      answer: picked =>
        reply(true, { answers: picked.map((labels, i) => ({ question_index: i, selected_labels: labels })).filter(a => a.selected_labels.length) }),
      decline,
    };
  }
  if (kind === "input") {
    const fields = (tool.arguments as ToolSecretArguments | undefined)?.secrets_schema ?? [];
    return {
      kind,
      fields: fields.map(f => ({ name: f.secretName ?? "", description: f.description })),
      submit: values => reply(true, { secrets: values }),
      decline,
    };
  }
  if (kind === "approval") {
    return { kind, action: tool.name ?? "", reason: tool.approval?.reason ?? tool.approval?.details?.summary ?? "", approve: () => reply(true), decline };
  }
  return { kind: "unknown", action: tool.name ?? "", decline };
}
