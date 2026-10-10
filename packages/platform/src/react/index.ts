/** The `@base44/platform/react` entry: one app's builder chat as a hook, and a provider with parts you replace. React is an optional peer, loaded only here. */
export { useBase44Chat } from "./useBase44Chat.js";
export { Base44ChatProvider } from "./Base44ChatProvider.js";
export { useChatActions, useChatComponents, useChatState } from "./context.js";
export { Message, Question } from "./Message.js";
export type {
  ApprovalQuestion, Base44App, Base44Chat, Base44ChatOptions, Base44ChatServer, ChatError, ChatItem, ChatPhase, ChatStep,
  ChoiceEntry, ChoiceQuestion, InputField, InputQuestion, LiveSession, Question as ChatQuestion, ToolCallAnswer, UnknownQuestion,
} from "./chat.types.js";
export type {
  Base44ChatProviderProps, ChatActions, ChatComponentOverrides, ChatComponents, ChatState, MessageComponents, MessageProps,
  QuestionComponents, QuestionProps, StepProps, TextProps,
} from "./components.types.js";
