"use client";
import { useState } from "react";
import { useBase44Chat, type Base44App, type Base44ChatServer, type Question } from "@base44/platform/react";
import { Approval, Button, Choice, Secrets, StatusLine, Step, Text } from "./chatParts";
import { createApp, openLiveSession, sendMessage, submitToolCallInput } from "./server";

// The four server functions, handed to the library. Next.js calls them on the server.
const server: Base44ChatServer = { createApp, openLiveSession, sendMessage, submitToolCallInput };

export type ChatProps = {
  app: Base44App | null;
  onAppCreated: (app: Base44App) => void;
};

// Option A, the hook only: the hook holds all the Base44 logic, and the chat draws every item
// itself with its own parts, choosing the part for each question kind.
export default function Chat({ app, onAppCreated }: ChatProps) {
  const chat = useBase44Chat({ appId: app?.id ?? null, server, onAppCreated });
  const [prompt, setPrompt] = useState("");

  function submit() {
    // No app yet: the first prompt creates one. Otherwise it goes to the selected app.
    if (app) chat.send(prompt);
    else chat.create(prompt);
    setPrompt("");
  }

  return (
    <div className="flex h-full flex-col text-sm">
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
        {chat.items.map((item) => (
          <div key={item.id} className="flex flex-col gap-1">
            {item.text && <Text text={item.text} role={item.role} />}
            {item.steps.map((step) => (
              <Step key={step.id} {...step} />
            ))}
            {item.question && <OpenQuestion question={item.question} />}
          </div>
        ))}
        <StatusLine phase={chat.phase} error={chat.error} onDismiss={chat.clearError} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="m-3 flex gap-2 rounded-2xl border p-2">
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={app ? "Ask for a change…" : "Describe your app…"}
          className="flex-1 bg-transparent px-2 outline-none"
        />
        {/* canSend is false while a question is open: Base44 drops a message sent into a stopped turn. */}
        <Button disabled={!chat.canSend || !prompt.trim()}>Send</Button>
      </form>
    </div>
  );
}

// Each kind carries only its own actions, already bound to this question's tool call.
function OpenQuestion({ question }: { question: Question }) {
  switch (question.kind) {
    case "choice":
      return <Choice {...question} />;
    case "input":
      return <Secrets {...question} />;
    case "approval":
      return <Approval {...question} />;
    default:
      return <Button variant="ghost" onClick={question.decline}>Decline {question.action}</Button>;
  }
}
