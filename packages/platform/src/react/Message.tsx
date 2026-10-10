"use client";
import type { MessageProps, QuestionProps } from "./components.types.js";
import { useChatComponents } from "./context.js";

/**
 * Draws one chat item with the parts from the nearest {@link Base44ChatProvider}: its text,
 * one `Step` per tool call, and its open question. It adds no element of its own, so wrap it
 * to lay messages out. Outside a provider it uses the unstyled fallbacks.
 *
 * @param props - The item to draw.
 * @returns The item's parts.
 *
 * @example
 * ```tsx
 * // Align by role in your own wrapper
 * <div className={item.role === "user" ? "ml-auto" : ""}>
 *   <Message item={item} />
 * </div>
 * ```
 */
export function Message({ item }: MessageProps) {
  const { Text, Step } = useChatComponents().message;
  return (
    <>
      {item.text && <Text text={item.text} role={item.role} />}
      {item.steps.map(step => (
        <Step key={step.id} {...step} />
      ))}
      {item.question && <Question question={item.question} />}
    </>
  );
}

/**
 * Draws an open question with the part for its kind, from the nearest
 * {@link Base44ChatProvider}. The part receives the question with its bound actions.
 * {@link Message} already draws an item's question; use this to show it somewhere else.
 *
 * @param props - The question to draw.
 * @returns The part for the question's kind.
 *
 * @example
 * ```tsx
 * // The open question pinned above the composer
 * const open = items.find((item) => item.question)?.question;
 * return open ? <Question question={open} /> : null;
 * ```
 */
export function Question({ question }: QuestionProps) {
  const { Choice, Input, Approval, Unknown } = useChatComponents().question;
  switch (question.kind) {
    case "choice":
      return <Choice {...question} />;
    case "input":
      return <Input {...question} />;
    case "approval":
      return <Approval {...question} />;
    default:
      return <Unknown {...question} />;
  }
}
