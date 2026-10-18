import type { Message, QuestionArguments, QuestionInput, SetSecretsArguments } from "../client/modules/builder.events.generated.js";
import type { ToolCall } from "../client/modules/builder.events.types.js";
import type { ApprovalDetails, ChatAnswer, ChatItem, ChatQuestion, ChatStep } from "./chat.types.js";

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

// What a tool's display projection may carry; each tool declares only some of it.
type ToolDisplay = { file_paths?: string[]; summary?: string; entity_name?: string; record_count?: number };

function toStep(toolCall: ToolCall, answerToolCall: AnswerToolCall | undefined): ChatStep {
  const toolName = toolCall.name ?? "";
  const display = "display" in toolCall ? (toolCall.display as ToolDisplay | null | undefined) : undefined;
  const files = display?.file_paths ?? [];
  const summary = display?.summary ?? (toolArguments(toolCall) as { summary?: string } | undefined)?.summary;
  const status = stepStatus(toolCall);
  const question = status === "waiting" && answerToolCall ? toQuestion(toolCall, answerToolCall) : undefined;
  const answered = answersOf(toolCall);
  return {
    id: toolCall.id!,
    tool: toolName,
    files,
    label: stepLabel(toolName, files, summary, display),
    status,
    ...(question && { question }),
    ...(answered && { answered }),
  };
}

// Base44's own description of the step reads best; then the entity it touched; then the files.
function stepLabel(toolName: string, files: string[], summary: string | undefined, display: ToolDisplay | null | undefined): string {
  if (summary) return summary;
  const entityName = display?.entity_name;
  if (entityName) {
    const recordCount = display?.record_count;
    return recordCount === undefined ? `${toolName} ${entityName}` : `${toolName} ${entityName} (${recordCount})`;
  }
  return [toolName, ...files].join(" ");
}

// What the user answered on a choice, each answer next to the question it answers.
function answersOf(toolCall: ToolCall): ChatAnswer[] | undefined {
  const userInput = "user_input" in toolCall ? (toolCall.user_input as QuestionInput | null | undefined) : undefined;
  if (!userInput?.answers?.length) return undefined;
  const questions = (toolArguments(toolCall) as QuestionArguments | undefined)?.questions ?? [];
  return userInput.answers.map(answer => {
    const labels = answer.selected_labels ?? (answer.selected_label ? [answer.selected_label] : []);
    const question = questions[answer.question_index ?? -1]?.question ?? "";
    return { question, labels, ...(answer.custom_text && { text: answer.custom_text }) };
  });
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
 * text. Base44's public send carries no client id, so text is the only link, and a prompt someone
 * else sent to the same app never settles one of ours. */
export function settlePendingPrompts(pendingPrompts: PendingPrompt[], appId: string, arrivedPrompts: string[]): PendingPrompt[] {
  let stillPending = pendingPrompts;
  for (const arrivedPrompt of arrivedPrompts) {
    const settled = stillPending.find(prompt => prompt.appId === appId && prompt.content.trim() === arrivedPrompt.trim());
    if (settled) stillPending = stillPending.filter(prompt => prompt !== settled);
  }
  return stillPending;
}

/** @internal Pending prompts as items, drawn after the messages Base44 has. */
export function pendingPromptItems(pendingPrompts: PendingPrompt[]): ChatItem[] {
  return pendingPrompts.map(prompt => ({ id: prompt.id, role: "user", text: prompt.content, createdAt: prompt.createdAt, steps: [], pending: true }));
}

/** @internal Base44's question formats, as one simple shape per kind, each bound to the call that
 * answers it. Base44 keys choice answers by position, so `picked` and `texts` follow `questions`,
 * and like Base44's builder a single pick goes in `selected_label`, several in `selected_labels`,
 * and free text in `custom_text`. A kind this release doesn't know has no shape. */
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
        type: question.type,
        options: (question.options ?? []).map(option => (typeof option === "string" ? option : option.label ?? "")),
        multi: !!question.multi_select,
      })),
      answer: (picked, texts = []) => {
        const answers = questions.flatMap((question, questionIndex) => {
          const labels = picked[questionIndex] ?? [];
          const customText = texts[questionIndex]?.trim();
          if (!labels.length && !customText) return [];
          const answer: Record<string, unknown> = { question_index: questionIndex };
          if (question.multi_select && labels.length) answer.selected_labels = labels;
          if (!question.multi_select && labels.length) answer.selected_label = labels[0];
          if (customText) answer.custom_text = customText;
          return [answer];
        });
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
    // Guards that declare a reason or details carry them; the others name only themselves.
    const approval = toolCall.approval as GuardApproval | null | undefined;
    const reason = approval?.reason ?? approval?.details?.summary ?? "";
    const guard = approval?.guard ?? "";
    return { kind, action: toolCall.name ?? "", reason, guard, details: approvalDetails(approval?.details), approve: () => answerToolCall(true), decline };
  }
  return undefined;
}

// Every detail a guard may publish, across Base44's guards.
type GuardApproval = {
  guard?: string;
  reason?: string | null;
  details?: {
    summary?: string; entity_name?: string; change_type?: string; changed_ops?: string[];
    function_name?: string; method?: string; inspection_failed?: boolean;
  } | null;
};

function approvalDetails(details: GuardApproval["details"]): ApprovalDetails {
  if (!details) return {};
  const mapped: ApprovalDetails = {
    summary: details.summary,
    entityName: details.entity_name,
    changeType: details.change_type,
    changedOps: details.changed_ops,
    functionName: details.function_name,
    method: details.method,
    inspectionFailed: details.inspection_failed,
  };
  return Object.fromEntries(Object.entries(mapped).filter(([, value]) => value !== undefined)) as ApprovalDetails;
}

// The waiting kind says which arguments a call carries; the tool's name only narrows the union.
function toolArguments(toolCall: ToolCall): unknown {
  return "arguments" in toolCall ? toolCall.arguments : undefined;
}
