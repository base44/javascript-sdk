import type { ComponentType, ReactNode } from "react";
import type {
  ApprovalQuestion, Base44Chat, Base44ChatOptions, ChatItem, ChatStep, ChoiceQuestion, InputQuestion, Question, UnknownQuestion,
} from "./chat.types.js";

/** Props of the `Text` part: one message's text. */
export interface TextProps {
  /** The message text. Never empty: an item without text renders no `Text`. */
  text: string;
  /** Who wrote it, to align or color it. */
  role: ChatItem["role"];
}

/** Props of the `Step` part: one tool call of a message. */
export type StepProps = ChatStep;

/** The parts of a message's own content. */
export interface MessageComponents {
  /** Draws a message's text. */
  Text: ComponentType<TextProps>;
  /** Draws one tool call as a line of activity. */
  Step: ComponentType<StepProps>;
}

/**
 * One part per question kind. Each receives the question itself: its content and the actions
 * bound to it, so a part can only ever answer the question it draws.
 */
export interface QuestionComponents {
  /** Draws a pick between options. Call `answer` with one list of labels per question. */
  Choice: ComponentType<ChoiceQuestion>;
  /** Draws a form for values such as API keys. Call `submit` with the values keyed by field name. */
  Input: ComponentType<InputQuestion>;
  /** Draws a request to run an action. Call `approve` or `decline`. */
  Approval: ComponentType<ApprovalQuestion>;
  /** Draws a kind added after this release. It can only `decline`. */
  Unknown: ComponentType<UnknownQuestion>;
}

/** Every replaceable part, grouped the way the library draws them. */
export interface ChatComponents {
  /** The parts of a message. */
  message: MessageComponents;
  /** The parts of an open question. */
  question: QuestionComponents;
}

/** The parts you replace. Anything left out is drawn as plain, unstyled HTML. */
export interface ChatComponentOverrides {
  /** Replacements for message parts. */
  message?: Partial<MessageComponents>;
  /** Replacements for question parts. */
  question?: Partial<QuestionComponents>;
}

/** What {@link useChatState} returns: everything that changes as the chat runs. */
export type ChatState = Pick<Base44Chat, "items" | "phase" | "error" | "canSend" | "messages">;

/** What {@link useChatActions} returns: the actions, with the same identity for the life of the provider. */
export type ChatActions = Pick<Base44Chat, "send" | "create" | "clearError">;

/** Props of {@link Base44ChatProvider}: the {@link useBase44Chat} options, the parts, and the tree that reads them. */
export interface Base44ChatProviderProps extends Base44ChatOptions {
  /** Parts to replace. Read part by part, so an inline object is fine. */
  components?: ChatComponentOverrides;
  /** The components that read the chat. */
  children?: ReactNode;
}

/** Props of {@link Message}. */
export interface MessageProps {
  /** The item to draw, one of the `items` from {@link useChatState} or {@link useBase44Chat}. */
  item: ChatItem;
}

/** Props of {@link Question}. */
export interface QuestionProps {
  /** The open question to draw, from {@link ChatItem.question}. */
  question: Question;
}
