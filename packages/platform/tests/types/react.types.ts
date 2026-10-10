import type { ChatMessage } from "@base44/platform";
import { useBase44Chat, type Base44Chat, type Base44ChatServer, type ChatItem, type Question } from "@base44/platform/react";

const server: Base44ChatServer = {
  async createApp(prompt) { return { id: "a".repeat(24), name: prompt }; },
  async openLiveSession() { return { serverUrl: "https://example.test", sessionToken: "token" }; },
  async sendMessage() {},
  async submitToolCallInput(appId, answer) { void answer.toolCallId; void answer.messageId; void answer.approve; void answer.extraUserInput; },
};
// @ts-expect-error All four calls are required.
const partial: Base44ChatServer = { createApp: server.createApp };
void partial;

declare const chat: Base44Chat;
const phase: "idle" | "creating" | "loading" | "waiting" | "building" = chat.phase;
void phase;
const sent: Promise<void> = chat.send("prompt");
void sent;
const raw: ChatMessage[] = chat.messages;
void raw;
// @ts-expect-error The hook is the API; there is no status string.
void chat.status;
// @ts-expect-error Answers belong to the question, not to the chat.
void chat.approve;

declare const item: ChatItem;
const step: "running" | "waiting" | "done" | "error" = item.steps[0].status;
void step;

declare const question: Question;
switch (question.kind) {
  case "choice":
    void question.answer([["A"], []]);
    void question.questions[0].multi;
    // @ts-expect-error A choice is answered, not approved.
    void question.approve;
    break;
  case "input":
    void question.submit({ API_KEY: "value" });
    void question.fields[0].name;
    break;
  case "approval":
    void question.approve();
    void question.reason;
    break;
  case "unknown":
    void question.decline();
    // @ts-expect-error An unknown kind can only be declined.
    void question.approve;
    break;
}
// @ts-expect-error Every kind must be handled; there is no fifth.
const exhaustive: never = question;
void exhaustive;

// @ts-expect-error appId is required, as null when there is no app yet.
void useBase44Chat({ server });
