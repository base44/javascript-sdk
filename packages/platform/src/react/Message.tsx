"use client";
import { Fragment } from "react";
import type { MessageProps, QuestionProps } from "./components.types.js";
import { useResolvedComponents } from "./context.js";

/**
 * Draws one chat item with the parts from the nearest {@link Base44ChatProvider}, always in the
 * same order: its text, then one `Step` per tool call, each followed by its open question, if it has
 * one. Only the last assistant message carries questions.
 *
 * It adds no element of its own, so wrap it to lay messages out.
 *
 * @param props - The item to draw.
 * @returns The item's parts.
 * @throws {Error} When there is no provider above the component.
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
  const { Text, Step } = useResolvedComponents("Message").message;
  return (
    <>
      {item.text && <Text text={item.text} role={item.role} pending={item.pending} />}
      {item.steps.map(step => (
        <Fragment key={step.id}>
          <Step {...step} />
          {step.question && <Question question={step.question} />}
        </Fragment>
      ))}
    </>
  );
}

/**
 * Draws an open question with the part for its kind, from the nearest {@link Base44ChatProvider}.
 * The part receives the question with its bound actions. {@link Message} already draws a message's
 * questions; use this to show one somewhere else.
 *
 * @param props - The question to draw.
 * @returns The part for the question's kind.
 * @throws {Error} When there is no provider above the component.
 *
 * @example
 * ```tsx
 * // The open questions, pinned above the composer
 * const { items } = useChatState();
 * const open = items.flatMap((item) => item.steps.flatMap((step) => (step.question ? [step.question] : [])));
 * return open.map((question, i) => <Question key={i} question={question} />);
 * ```
 */
export function Question({ question }: QuestionProps) {
  const { Choice, Secrets, Approval } = useResolvedComponents("Question").question;
  switch (question.kind) {
    case "choice":
      return <Choice {...question} />;
    case "secrets":
      return <Secrets {...question} />;
    case "approval":
      return <Approval {...question} />;
  }
}
