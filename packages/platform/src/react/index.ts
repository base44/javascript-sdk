/** The `@base44/platform/react` entry: the AI chat for one app, as a React hook. React is an optional peer, loaded only here. */
import { useChat } from "./useChat.js";
import type { UseChatResult, ChatApp, ChatBackend, ChatOptions } from "./chat.types.js";

export { useChat };
export type {
  ApprovalDetails, ApprovalQuestion, ChatApp, UseChatResult, ChatOptions, ChatBackend, ChatAnswer, ChatConnection, ChatError, ChatItem, ChatQuestion,
  ChatStatus, ChatStep, ChoiceEntry, ChoiceQuestion, SecretField, SecretsQuestion, ToolCallAnswer,
} from "./chat.types.js";
export type { SocketSession } from "../client/modules/chat.types.js";

// The names before 0.5.0, kept for one release so existing code keeps working.

/** @deprecated Renamed to {@link useChat}. Removed in 0.6.0. @hidden */
export const useBase44Chat = useChat;
/** @deprecated Renamed to {@link UseChatResult}. Removed in 0.6.0. @hidden */
export type Base44Chat = UseChatResult;
/** @deprecated Renamed to {@link ChatOptions}. Removed in 0.6.0. @hidden */
export type Base44ChatOptions = ChatOptions;
/** @deprecated Renamed to {@link ChatBackend}. Removed in 0.6.0. @hidden */
export type Base44ChatBackend = ChatBackend;
/** @deprecated Renamed to {@link ChatApp}. Removed in 0.6.0. @hidden */
export type Base44App = ChatApp;
