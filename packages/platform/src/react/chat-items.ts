import type { Message, QuestionArguments, SetSecretsArguments } from "../client/modules/builder.events.generated.js";
import type { ToolCall } from "../client/modules/builder.events.types.js";
import type { ChatItem, ChatQuestion, ChatStep } from "./chat.types.js";

/** @internal Sends the answer to the one tool call a question belongs to. */
export type AnswerToolCall = (approve: boolean, extraUserInput?: Record<string, unknown>) => Promise<void>;

/** @internal Sends an answer to a given tool call in a given message. */
export type SubmitAnswer = (toolCallId: string, messageId: string, approve: boolean, extraUserInput?: Record<string, unknown>) => Promise<void>;

/** @internal Events can arrive out of order, so messages are ordered by when they were created. */
export function sortMessages(messages: Message[]): Message[] {
  return [...messages].sort((first, second) => (first.metadata?.created_date ?? "").localeCompare(second.metadata?.created_date ?? ""));
}

/** @internal Replaces the message with the same id in place, or adds it at the end. */
export function mergeMessage(messages: Message[], updatedMessage: Message): Message[] {
  const isKnown = messages.some(message => message.id === updatedMessage.id);
  if (!isKnown) return [...messages, updatedMessage];
  return messages.map(message => (message.id === updatedMessage.id ? updatedMessage : message));
}

/** @internal How many of the newest messages a snapshot holds. */
export const SNAPSHOT_SIZE = 50;

/** @internal A rejoin's snapshot holds only the newest messages: it is the truth for its window,
 * and the messages before its oldest one stay. A snapshot with room to spare holds them all. */
export function mergeSnapshot(heldMessages: Message[], snapshotMessages: Message[]): Message[] {
  if (snapshotMessages.length < SNAPSHOT_SIZE) return snapshotMessages;
  const oldestSnapshotDate = sortMessages(snapshotMessages)[0]?.metadata?.created_date ?? "";
  const snapshotIds = new Set(snapshotMessages.map(message => message.id));
  const olderMessages = heldMessages.filter(
    message => !snapshotIds.has(message.id) && (message.metadata?.created_date ?? "") < oldestSnapshotDate,
  );
  return [...olderMessages, ...snapshotMessages];
}

/** @internal An assistant message that answers a turn. Base44 injects notices that expect no reply. */
function isTurnReply(message: Message | undefined): boolean {
  return message?.role === "assistant" && !message.additional_message_params?.skip_ai_response;
}

/** @internal The last assistant message that answers a turn, as Base44's own builder finds it. */
function lastTurnReply(sortedMessages: Message[]): Message | undefined {
  return [...sortedMessages].reverse().find(isTurnReply);
}

/** @internal Turns sorted messages into items. A waiting tool call that is not answered yet and is
 * of a kind this release knows carries its own question, in the last turn reply only: the one that
 * makes the chat wait. Older waiting calls keep their status but no question. */
export function toItems(sortedMessages: Message[], answeredToolCallIds: string[], submitAnswer: SubmitAnswer): ChatItem[] {
  const lastReply = lastTurnReply(sortedMessages);
  return sortedMessages.map(message => ({
    id: message.id!,
    role: message.role === "user" ? "user" : "assistant",
    text: message.content ?? "",
    createdAt: message.metadata?.created_date ?? "",
    pending: false,
    steps: (message.tool_calls ?? []).map(toolCall => {
      const isAnswerable = message === lastReply && !answeredToolCallIds.includes(toolCall.id!);
      const answerToolCall: AnswerToolCall | undefined = isAnswerable
        ? (approve, extraUserInput) => submitAnswer(toolCall.id!, message.id!, approve, extraUserInput)
        : undefined;
      return toStep(toolCall, answerToolCall);
    }),
  }));
}

function toStep(toolCall: ToolCall, answerToolCall: AnswerToolCall | undefined): ChatStep {
  const toolName = toolCall.name ?? "";
  // Only file tools carry `display.file_paths`.
  const display = "display" in toolCall ? (toolCall.display as { file_paths?: string[] } | null | undefined) : undefined;
  const files = display?.file_paths ?? [];
  const status = stepStatus(toolCall);
  const question = status === "waiting" && answerToolCall ? toQuestion(toolCall, answerToolCall) : undefined;
  return { id: toolCall.id!, tool: toolName, files, label: [toolName, ...files].join(" "), status, ...(question && { question }) };
}

/** @internal Base44's tool call status, as a step's. */
export function stepStatus(toolCall: ToolCall): ChatStep["status"] {
  if (toolCall.status === "running") return "running";
  if (toolCall.status === "waiting_for_user_input") return "waiting";
  if (toolCall.status === "stopped") return "stopped";
  if (toolCall.status === "error") return "error";
  return "done";
}

/** @internal Whether the chat waits on the user. Like Base44's builder, only the last turn reply
 * counts, and a call answered or declined here stops counting. */
export function isWaitingForUser(sortedMessages: Message[], answeredToolCallIds: string[]): boolean {
  const lastReply = lastTurnReply(sortedMessages);
  return !!lastReply?.tool_calls?.some(
    toolCall => toolCall.status === "waiting_for_user_input" && !answeredToolCallIds.includes(toolCall.id!),
  );
}

const KNOWN_QUESTION_KINDS = ["approval", "choice", "input"];

/** @internal Waiting calls on the last turn reply whose kind Base44 names and this release doesn't
 * know, to decline. A call with no kind comes only from old messages and is left alone. */
export function unknownKindToolCalls(sortedMessages: Message[]): { toolCallId: string; messageId: string }[] {
  const lastReply = lastTurnReply(sortedMessages);
  if (!lastReply) return [];
  return (lastReply.tool_calls ?? [])
    .filter(toolCall => {
      const kind = toolCall.waiting_on?.kind;
      return toolCall.status === "waiting_for_user_input" && !!kind && !KNOWN_QUESTION_KINDS.includes(kind);
    })
    .map(toolCall => ({ toolCallId: toolCall.id!, messageId: lastReply.id! }));
}

/** @internal The ids of every tool call Base44 reports waiting. */
export function waitingToolCallIds(sortedMessages: Message[]): Set<string> {
  return new Set(
    sortedMessages.flatMap(message =>
      (message.tool_calls ?? []).filter(toolCall => toolCall.status === "waiting_for_user_input").map(toolCall => toolCall.id!),
    ),
  );
}

/** @internal A prompt sent from this chat that Base44 has not confirmed, for the app it went to. */
export interface PendingPrompt {
  id: string;
  content: string;
  createdAt: string;
  appId: string;
}

/** @internal Prompts that arrived from Base44 as messages settle the pending ones with the same
 * text. Base44's public send carries no client id, so text is the only link. With
 * `settleOldestIfUnmatched`, an arrival that matches none settles the oldest, so a prompt Base44
 * changed on the way never stays pending. */
export function settlePendingPrompts(
  pendingPrompts: PendingPrompt[],
  appId: string,
  arrivedPrompts: string[],
  settleOldestIfUnmatched: boolean,
): PendingPrompt[] {
  let stillPending = pendingPrompts;
  for (const arrivedPrompt of arrivedPrompts) {
    const pendingForApp = stillPending.filter(prompt => prompt.appId === appId);
    const exactMatch = pendingForApp.find(prompt => prompt.content.trim() === arrivedPrompt.trim());
    const settled = exactMatch ?? (settleOldestIfUnmatched ? pendingForApp[0] : undefined);
    if (settled) stillPending = stillPending.filter(prompt => prompt !== settled);
  }
  return stillPending;
}

/** @internal Pending prompts as items, drawn after the messages Base44 has. */
export function pendingPromptItems(pendingPrompts: PendingPrompt[]): ChatItem[] {
  return pendingPrompts.map(prompt => ({ id: prompt.id, role: "user", text: prompt.content, createdAt: prompt.createdAt, steps: [], pending: true }));
}

/** @internal Base44's question formats, as one simple shape per kind, each bound to the call that
 * answers it. Base44 keys choice answers by position, so `picked` follows `questions`. A kind this
 * release doesn't know has no shape. */
export function toQuestion(toolCall: ToolCall, answerToolCall: AnswerToolCall): ChatQuestion | undefined {
  const kind = toolCall.waiting_on?.kind;
  const decline = () => answerToolCall(false);
  if (kind === "choice") {
    const questions = (toolArguments(toolCall) as QuestionArguments | undefined)?.questions ?? [];
    return {
      kind,
      questions: questions.map(question => ({
        text: question.question ?? "",
        description: question.description,
        options: (question.options ?? []).map(option => (typeof option === "string" ? option : option.label ?? "")),
        multi: !!question.multi_select,
      })),
      answer: picked => {
        const answers = picked
          .map((labels, questionIndex) => ({ question_index: questionIndex, selected_labels: labels }))
          .filter(answer => answer.selected_labels.length);
        return answerToolCall(true, { answers });
      },
      decline,
    };
  }
  if (kind === "input") {
    const secretFields = (toolArguments(toolCall) as SetSecretsArguments | undefined)?.secrets_schema ?? [];
    return {
      kind: "secrets",
      fields: secretFields.map(field => ({ name: field.secretName ?? "", description: field.description })),
      submit: values => answerToolCall(true, { secrets: values }),
      decline,
    };
  }
  if (kind === "approval") {
    // Guards that declare a reason or a summary carry them; the others name only themselves.
    const approval = toolCall.approval as { reason?: string | null; details?: { summary?: string | null } | null } | null | undefined;
    const reason = approval?.reason ?? approval?.details?.summary ?? "";
    return { kind, action: toolCall.name ?? "", reason, approve: () => answerToolCall(true), decline };
  }
  return undefined;
}

// The waiting kind says which arguments a call carries; the tool's name only narrows the union.
function toolArguments(toolCall: ToolCall): unknown {
  return "arguments" in toolCall ? toolCall.arguments : undefined;
}
