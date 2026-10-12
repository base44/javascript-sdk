"use client";
import { useState, type ButtonHTMLAttributes } from "react";
import type { ApprovalQuestion, ChatComponentOverrides, ChatError, ChatPhase, ChoiceQuestion, InputQuestion, StepProps, TextProps } from "@base44/platform/react";

// Tiny's look. Each part takes exactly the props the library hands it, and a question part gets
// the question with its bound actions. `chatParts` at the end groups them for the provider.

// Stands in for Tiny's shadcn Button, so the example has no UI dependency.
export function Button({ variant = "default", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "outline" | "ghost" }) {
  const look = { default: "bg-primary text-primary-foreground", outline: "border", ghost: "" }[variant];
  return <button {...props} data-variant={variant} className={`rounded-md px-2.5 py-1 text-sm ${look} ${className}`} />;
}

export function Text({ text, role }: TextProps) {
  return <p className={role === "user" ? "ml-auto max-w-[80%] rounded-2xl bg-muted px-4 py-2 whitespace-pre-wrap" : "whitespace-pre-wrap"}>{text}</p>;
}

const stepIcons = { running: "…", waiting: "?", done: "✓", error: "✗" };

export function Step({ label, status }: StepProps) {
  return <p className="text-xs text-muted-foreground">{stepIcons[status]} {label}</p>;
}

export function Choice({ questions, answer, decline }: ChoiceQuestion) {
  // One list of picked labels per question, in the same order as `questions`.
  const [picked, setPicked] = useState<string[][]>(questions.map(() => []));
  function toggle(i: number, option: string, multi: boolean) {
    setPicked((all) =>
      all.map((labels, j) => {
        if (j !== i) return labels;
        if (labels.includes(option)) return labels.filter((o) => o !== option);
        return multi ? [...labels, option] : [option];
      }),
    );
  }
  return (
    <div className="flex flex-col gap-3 rounded-xl border p-3">
      {questions.map((q, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          <p className="font-medium">{q.text}</p>
          {q.description && <p className="text-xs text-muted-foreground">{q.description}</p>}
          <div className="flex flex-wrap gap-1">
            {q.options.map((option) => (
              <Button key={option} variant={picked[i].includes(option) ? "default" : "outline"} onClick={() => toggle(i, option, q.multi)}>
                {option}
              </Button>
            ))}
          </div>
        </div>
      ))}
      <div className="flex gap-2">
        <Button onClick={() => answer(picked)}>Send answer</Button>
        <Button variant="ghost" onClick={decline}>Decline</Button>
      </div>
    </div>
  );
}

export function Secrets({ fields, submit, decline }: InputQuestion) {
  const [values, setValues] = useState<Record<string, string>>({});
  return (
    <div className="flex flex-col gap-2 rounded-xl border p-3">
      {fields.map((field) => (
        <input
          key={field.name}
          type="password"
          placeholder={field.name}
          title={field.description}
          onChange={(e) => setValues({ ...values, [field.name]: e.target.value })}
          className="rounded-md border px-2 py-1"
        />
      ))}
      <div className="flex gap-2">
        <Button onClick={() => submit(values)}>Save</Button>
        <Button variant="ghost" onClick={decline}>Decline</Button>
      </div>
    </div>
  );
}

export function Approval({ action, reason, approve, decline }: ApprovalQuestion) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border p-3">
      <p className="font-medium">Allow {action}?</p>
      {reason && <p className="text-xs text-muted-foreground">{reason}</p>}
      <div className="flex gap-2">
        <Button onClick={approve}>Approve</Button>
        <Button variant="ghost" onClick={decline}>Decline</Button>
      </div>
    </div>
  );
}

// The wording for each phase is the partner's, not the library's.
const phaseText: Record<ChatPhase, string> = {
  idle: "",
  creating: "Creating app…",
  loading: "Loading the conversation…",
  waiting: "Waiting for your answer",
  building: "Building…",
};

export function StatusLine({ phase, error, onDismiss }: { phase: ChatPhase; error: ChatError | null; onDismiss: () => void }) {
  if (error) {
    return (
      <p className="text-xs text-destructive">
        {error.message} <Button variant="ghost" onClick={onDismiss}>Dismiss</Button>
      </p>
    );
  }
  return <p className="text-xs text-muted-foreground">{phaseText[phase]}</p>;
}

// The same parts, grouped the way <Base44ChatProvider> takes them. Unknown is left out, so the
// library's unstyled fallback draws it.
export const chatParts: ChatComponentOverrides = { message: { Text, Step }, question: { Choice, Input: Secrets, Approval } };
