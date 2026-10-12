"use client";
import { useState } from "react";
import { Base44ChatProvider, Message, useChatActions, useChatState, type Base44App, type Base44ChatServer } from "@base44/platform/react";
import { Button, StatusLine, chatParts } from "./chatParts";
import { createApp, openLiveSession, sendMessage, submitToolCallInput } from "./server";

// The four server functions, handed to the library. Next.js calls them on the server.
const server: Base44ChatServer = { createApp, openLiveSession, sendMessage, submitToolCallInput };

export type ChatProps = {
  app: Base44App | null;
  onAppCreated: (app: Base44App) => void;
};

// Option B, the provider: it runs the chat for the tree below it, and <Message> draws each item
// with the parts. The list and the composer read the chat from context.
export default function Chat({ app, onAppCreated }: ChatProps) {
  return (
    <Base44ChatProvider appId={app?.id ?? null} server={server} onAppCreated={onAppCreated} components={chatParts}>
      <div className="flex h-full flex-col text-sm">
        <Messages />
        <Composer hasApp={!!app} />
      </div>
    </Base44ChatProvider>
  );
}

function Messages() {
  const { items, phase, error } = useChatState();
  const { clearError } = useChatActions();
  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
      {items.map((item) => (
        <div key={item.id} className="flex flex-col gap-1">
          <Message item={item} />
        </div>
      ))}
      <StatusLine phase={phase} error={error} onDismiss={clearError} />
    </div>
  );
}

function Composer({ hasApp }: { hasApp: boolean }) {
  const { canSend } = useChatState();
  const { send, create } = useChatActions();
  const [prompt, setPrompt] = useState("");

  function submit() {
    // No app yet: the first prompt creates one. Otherwise it goes to the selected app.
    if (hasApp) send(prompt);
    else create(prompt);
    setPrompt("");
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="m-3 flex gap-2 rounded-2xl border p-2">
      <input
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder={hasApp ? "Ask for a change…" : "Describe your app…"}
        className="flex-1 bg-transparent px-2 outline-none"
      />
      {/* canSend is false while a question is open: Base44 drops a message sent into a stopped turn. */}
      <Button disabled={!canSend || !prompt.trim()}>Send</Button>
    </form>
  );
}
