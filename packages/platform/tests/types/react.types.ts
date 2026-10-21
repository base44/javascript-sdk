import { useChat, type UseChatResult, type ChatBackend, type ChatItem, type ChatQuestion } from "@base44/platform/react";

const backend: ChatBackend = {
  async createApp(prompt) { return { id: "a".repeat(24), name: prompt }; },
  async openLiveSession() { return { session_token: "token", socket_url: "https://example.test", socket_path: "/ws/socket.io/" }; },
  async sendMessage() {},
  async submitToolCallInput(appId, answer) { void answer.toolCallId; void answer.messageId; void answer.approve; void answer.extraUserInput; },
};
// @ts-expect-error All four calls are required.
const partial: ChatBackend = { createApp: backend.createApp };
void partial;

declare const chat: UseChatResult;
const status: "ready" | "submitted" | "building" | "waiting" | "error" = chat.status;
void status;
const connection: "connecting" | "connected" | "disconnected" = chat.connection;
void connection;
const error: { message: string; code?: string; cause?: unknown } | null = chat.error;
void error;
// @ts-expect-error The queue is not part of this release; send while status is ready or error.
void chat.queue;
const sent: Promise<void> = chat.send("prompt");
void sent;
const created: Promise<void> = chat.create("prompt");
void created;
// @ts-expect-error Raw messages are not part of the contract; draw from items.
void chat.messages;
// @ts-expect-error Whether to send is the status's to say; there is no canSend.
void chat.canSend;
// @ts-expect-error Answers belong to the question, not to the chat.
void chat.approve;

declare const item: ChatItem;
const createdAt: string = item.createdAt;
void createdAt;
// @ts-expect-error A question belongs to its step, not to the message.
void item.question;
const step = item.steps[0];
const stepStatus: "running" | "waiting" | "done" | "stopped" | "error" = step.status;
void stepStatus;
const files: string[] = step.files;
void files;
void step.tool;

declare const question: ChatQuestion;
void question.decline();
switch (question.kind) {
  case "choice":
    void question.answer([["A"], []]);
    void question.questions[0].multi;
    // @ts-expect-error A choice is answered, not approved.
    void question.approve;
    break;
  case "secrets":
    void question.submit({ API_KEY: "value" });
    void question.fields[0].name;
    break;
  case "approval":
    void question.approve();
    void question.reason;
    break;
}
// @ts-expect-error Every kind must be handled; there is no fourth.
const exhaustive: never = question;
void exhaustive;
// @ts-expect-error A question names no tool call; its actions are already bound to one.
void question.toolCallId;

// @ts-expect-error The calls are the backend; there is no server option.
void useChat({ appId: null, server: backend });
// @ts-expect-error appId is required, as null when there is no app yet.
void useChat({ backend });
