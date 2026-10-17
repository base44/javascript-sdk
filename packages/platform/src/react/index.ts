/** The `@base44/platform/react` entry: the AI chat for one app, as a React hook. React is an optional peer, loaded only here. */
export { useBase44Chat } from "./useBase44Chat.js";
export type {
  ApprovalQuestion, Base44App, Base44Chat, Base44ChatOptions, Base44ChatBackend, ChatConnection, ChatError, ChatItem, ChatQuestion,
  ChatStatus, ChatStep, ChoiceEntry, ChoiceQuestion, SecretField, SecretsQuestion, ToolCallAnswer,
} from "./chat.types.js";
export type { SocketSession } from "../client/modules/builder.types.js";
