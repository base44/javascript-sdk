import type { ComponentType, ReactNode } from "react";
import type { ApprovalQuestion, Base44Chat, Base44ChatOptions, ChatItem, ChatQuestion, ChatStep, ChoiceQuestion, SecretsQuestion } from "./chat.types.js";

/** Props of the `Text` part: one message's text. */
export interface TextProps {
  /** The message text, as raw markdown. Never empty: an item without text draws no `Text`. */
  text: string;
  /** Who wrote the message, to align or color it. */
  role: ChatItem["role"];
  /** Whether this is a prompt Base44 hasn't confirmed yet. */
  pending: boolean;
}

/** Props of the `Step` part: one tool call of a message. */
export type StepProps = ChatStep;

/** The parts of a message's own content. Each one left out is drawn as plain, unstyled HTML. */
export interface MessageComponents {
  /** Draws a message's text. */
  Text: ComponentType<TextProps>;
  /** Draws one tool call as a line of activity. */
  Step: ComponentType<StepProps>;
}

/**
 * One part per question kind, all required. Each receives the question itself: its content and the
 * actions bound to it, so a part can only answer the question it draws.
 *
 * A release that adds a kind adds a part here, so upgrading tells you at compile time which part to
 * write. Until you upgrade, the chat declines the new kind for you.
 */
export interface QuestionComponents {
  /** Draws a pick between options. Call `answer` with one list of labels per question. */
  Choice: ComponentType<ChoiceQuestion>;
  /** Draws a form for values such as API keys. Call `submit` with the values keyed by field name. */
  Secrets: ComponentType<SecretsQuestion>;
  /** Draws a request to run an action. Call `approve` or `decline`. */
  Approval: ComponentType<ApprovalQuestion>;
}

/** The parts you pass to {@link Base44ChatProvider}: every question part, and the message parts you replace. */
export interface ChatComponents {
  /** Replacements for the message parts. */
  message?: Partial<MessageComponents>;
  /** A part for every question kind. */
  question: QuestionComponents;
}

/** What {@link useChatState} returns: everything that changes as the chat runs. */
export type ChatState = Pick<Base44Chat, "items" | "status" | "connection" | "error">;

/** What {@link useChatActions} returns. The actions keep their identity while the app stays the same. */
export type ChatActions = Pick<Base44Chat, "send" | "create" | "clearError">;

/** Props of {@link Base44ChatProvider}: the {@link useBase44Chat} options, the parts, and the tree that reads them. */
export interface Base44ChatProviderProps extends Base44ChatOptions {
  /** The parts that draw the chat. Read part by part, so an inline object works. */
  components: ChatComponents;
  /** The components that read the chat. */
  children?: ReactNode;
}

/** Props of {@link Message}. */
export interface MessageProps {
  /** The item to draw, one of the `items` from {@link useChatState}. */
  item: ChatItem;
}

/** Props of {@link Question}. */
export interface QuestionProps {
  /** The open question to draw, from {@link ChatStep.question}. */
  question: ChatQuestion;
}
