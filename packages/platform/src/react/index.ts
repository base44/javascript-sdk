/** The `@base44/platform/react` entry: the AI chat for one app, as a React hook. React is an optional peer, loaded only here. */
export { useChat } from "./useChat.js";
export type {
  ApprovalDetails, ApprovalQuestion, ChatApp, UseChatResult, ChatOptions, ChatBackend, ChatAnswer, ChatConnection, ChatError, ChatItem, ChatQuestion,
  ChatStatus, ChatStep, ChoiceEntry, ChoiceQuestion, SecretField, SecretsQuestion, ToolCallAnswer,
} from "./chat.types.js";
export type { SocketSession } from "../client/modules/chat.types.js";
