"use client";
import { useId, useState } from "react";
import type { ChatComponents, StepProps, TextProps } from "./components.types.js";
import type { ApprovalQuestion, ChoiceQuestion, InputQuestion, UnknownQuestion } from "./chat.types.js";

// The parts a partner does not replace: plain HTML, no classes, so the library has no look of
// its own and a question is never silently missing. Each carries a `data-base44` attribute for
// CSS to hook on.

function Text({ text, role }: TextProps) {
  return <p data-base44="text" data-role={role}>{text}</p>;
}

function Step({ label, status }: StepProps) {
  return <p data-base44="step" data-status={status}>{label}</p>;
}

function Choice({ questions, answer, decline }: ChoiceQuestion) {
  const name = useId();
  const [picked, setPicked] = useState<string[][]>(() => questions.map(() => []));
  function toggle(i: number, option: string, multi: boolean) {
    setPicked(all =>
      all.map((labels, j) => {
        if (j !== i) return labels;
        if (!multi) return [option];
        return labels.includes(option) ? labels.filter(o => o !== option) : [...labels, option];
      }),
    );
  }
  return (
    <form data-base44="question" data-kind="choice" onSubmit={e => { e.preventDefault(); void answer(picked); }}>
      {questions.map((q, i) => (
        <fieldset key={i}>
          <legend>{q.text}</legend>
          {q.description && <p>{q.description}</p>}
          {q.options.map(option => (
            <label key={option}>
              <input type={q.multi ? "checkbox" : "radio"} name={`${name}-${i}`} checked={picked[i]?.includes(option) ?? false} onChange={() => toggle(i, option, q.multi)} />
              {option}
            </label>
          ))}
        </fieldset>
      ))}
      <button type="submit">Send answer</button>
      <button type="button" onClick={() => void decline()}>Decline</button>
    </form>
  );
}

function Input({ fields, submit, decline }: InputQuestion) {
  const [values, setValues] = useState<Record<string, string>>({});
  return (
    <form data-base44="question" data-kind="input" onSubmit={e => { e.preventDefault(); void submit(values); }}>
      {fields.map(field => (
        <label key={field.name}>
          {field.name}
          {field.description && <small>{field.description}</small>}
          <input type="password" autoComplete="off" value={values[field.name] ?? ""} onChange={e => setValues(all => ({ ...all, [field.name]: e.target.value }))} />
        </label>
      ))}
      <button type="submit">Save</button>
      <button type="button" onClick={() => void decline()}>Decline</button>
    </form>
  );
}

function Approval({ action, reason, approve, decline }: ApprovalQuestion) {
  return (
    <div data-base44="question" data-kind="approval">
      <p>Allow {action}?</p>
      {reason && <p>{reason}</p>}
      <button type="button" onClick={() => void approve()}>Approve</button>
      <button type="button" onClick={() => void decline()}>Decline</button>
    </div>
  );
}

function Unknown({ action, decline }: UnknownQuestion) {
  return (
    <div data-base44="question" data-kind="unknown">
      <p>{action} is waiting for you.</p>
      <button type="button" onClick={() => void decline()}>Decline</button>
    </div>
  );
}

/** @internal */
export const fallbackComponents: ChatComponents = {
  message: { Text, Step },
  question: { Choice, Input, Approval, Unknown },
};
