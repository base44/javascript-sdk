/** The `@base44/platform/react` entry: the AI chat for one app, as a hook and as a provider that draws it with your parts. React is an optional peer, loaded only here. */
export { useBase44Chat } from "./useBase44Chat.js";
export { Base44ChatProvider } from "./Base44ChatProvider.js";
export { useChatActions, useChatState } from "./context.js";
export { Message, Question } from "./Message.js";
export type {
  ApprovalQuestion, Base44App, Base44Chat, Base44ChatOptions, Base44ChatBackend, ChatConnection, ChatError, ChatItem, ChatQuestion,
  ChatStatus, ChatStep, ChoiceEntry, ChoiceQuestion, SecretField, SecretsQuestion, ToolCallAnswer,
} from "./chat.types.js";
export type {
  Base44ChatProviderProps, ChatActions, ChatComponents, ChatState, MessageComponents, MessageProps, QuestionComponents, QuestionProps,
  StepProps, TextProps,
} from "./components.types.js";
export type { SocketSession } from "../client/modules/builder.types.js";
