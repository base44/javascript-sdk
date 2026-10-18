"use client";
import type { MessageComponents, StepProps, TextProps } from "./components.types.js";

// The message parts a partner does not replace: plain HTML, no classes, so the library has no look
// of its own. Each carries a `data-base44` attribute for CSS to hook on. Questions have no
// fallback: the partner supplies a part for every kind.

function Text({ text, role, pending }: TextProps) {
  return (
    <p data-base44="text" data-role={role} data-pending={pending || undefined}>
      {text}
    </p>
  );
}

function Step({ label, status }: StepProps) {
  return (
    <p data-base44="step" data-status={status}>
      {label}
    </p>
  );
}

/** @internal */
export const fallbackMessageComponents: MessageComponents = { Text, Step };
