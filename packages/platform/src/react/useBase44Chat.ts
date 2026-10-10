"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Base44PlatformClient } from "../client.js";
import type { ChatMessage } from "../modules/builder.events.types.js";
import { mergeMessage, sortMessages, toItems } from "./chat-items.js";
import type { Base44Chat, Base44ChatOptions, ChatError, ChatPhase } from "./chat.types.js";

/**
 * Runs one app's builder chat, headless: it keeps the live connection through
 * the platform client, turns Base44's messages into {@link ChatItem | items}, and binds
 * every open question to the actions that answer it. You render the items.
 *
 * All Base44 calls go through the {@link Base44ChatServer | server} you pass, so no
 * credential reaches the browser. Actions never throw: a failure lands in
 * {@link Base44Chat.error}, and a question whose reply failed opens again.
 *
 * Requires a browser environment. One live session is opened per app; switching
 * `appId` closes the old one and starts over.
 *
 * @param options - The app to watch, your backend's calls, and what to do with a created app.
 * @returns The conversation, its phase and error, and the actions `send`, `create` and `clearError`.
 *
 * @example
 * ```typescript
 * // Render the items, answer a question
 * const chat = useBase44Chat({ appId, server, onAppCreated: selectApp });
 * return (
 *   <>
 *     {chat.items.map((item) => (
 *       <div key={item.id}>
 *         <p>{item.text}</p>
 *         {item.steps.map((step) => <small key={step.id}>{step.label}</small>)}
 *         {item.question?.kind === "approval" && (
 *           <button onClick={item.question.approve}>Allow {item.question.action}</button>
 *         )}
 *       </div>
 *     ))}
 *     {chat.error && <p role="alert">{chat.error.message}</p>}
 *     <button disabled={!chat.canSend} onClick={() => (appId ? chat.send(prompt) : chat.create(prompt))}>Send</button>
 *   </>
 * );
 * ```
 */
export function useBase44Chat({ appId, server, onAppCreated }: Base44ChatOptions): Base44Chat {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [building, setBuilding] = useState(false);
  const [loading, setLoading] = useState(!!appId);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<ChatError | null>(null);
  const [answered, setAnswered] = useState<string[]>([]);

  // Switching apps starts over: the state resets in the same render that sees the new id.
  const [shownAppId, setShownAppId] = useState(appId);
  if (shownAppId !== appId) {
    setShownAppId(appId);
    setMessages([]);
    setBuilding(false);
    setLoading(!!appId);
    setError(null);
    setAnswered([]);
  }

  // The server and the callback are read through refs, kept current after every render, so an
  // inline `server={{…}}` or arrow never reopens the socket and never changes an action's identity.
  const serverRef = useRef(server);
  const onAppCreatedRef = useRef(onAppCreated);
  useEffect(() => {
    serverRef.current = server;
    onAppCreatedRef.current = onAppCreated;
  });

  const fail = useCallback((e: { code?: string; message?: string }) => setError({ message: e.message || "Something went wrong", code: e.code }), []);

  // Live updates: a snapshot on every connect, then events.
  useEffect(() => {
    if (!appId) return;
    let stopped = false;
    let session: { close(): void } | undefined;
    const failLive = (e: { code?: string; message?: string }) => fail({ message: e.message || "Live updates failed", code: e.code });

    serverRef.current
      .openLiveSession(appId)
      .then(({ serverUrl, sessionToken }) => {
        if (stopped) return;
        const builder = new Base44PlatformClient({ serverUrl, getSessionToken: () => sessionToken }).builder.init({ onError: failLive });
        session = builder;
        builder.subscribe(appId, {
          onSnapshot: snapshot => {
            setMessages(snapshot.messages);
            setLoading(false);
            setBuilding(snapshot.status?.state === "processing");
          },
          onEvent: event => {
            if (event.type === "message.updated") setMessages(all => mergeMessage(all, event.data.message));
            if (event.type === "message.removed") setMessages(all => all.filter(m => m.id !== event.data.message_id));
            if (event.type === "app.status_changed") setBuilding(event.data.status?.state === "processing");
          },
          onError: failLive,
        });
        return builder.connect();
      })
      .catch(failLive);

    return () => {
      stopped = true;
      session?.close();
    };
  }, [appId, fail]);

  // Answers one tool call. Its id leaves `answered` again if the submit fails, so the question comes back.
  const respond = useCallback(
    (toolCallId: string, messageId: string, approve: boolean, extraUserInput?: Record<string, unknown>) => {
      if (!appId) return Promise.resolve();
      setError(null);
      setAnswered(ids => [...ids, toolCallId]);
      return serverRef.current.submitToolCallInput(appId, { toolCallId, messageId, approve, extraUserInput }).catch((e: Error) => {
        setAnswered(ids => ids.filter(id => id !== toolCallId));
        fail(e);
      });
    },
    [appId, fail],
  );

  const sorted = useMemo(() => sortMessages(messages), [messages]);
  const items = useMemo(() => toItems(sorted, answered, respond), [sorted, answered, respond]);

  const waiting = items.some(item => item.question);
  const phase: ChatPhase = creating ? "creating" : loading ? "loading" : waiting ? "waiting" : building ? "building" : "idle";

  const send = useCallback(
    (prompt: string) => {
      if (!appId) return Promise.resolve();
      setError(null);
      return serverRef.current.sendMessage(appId, prompt).catch(fail);
    },
    [appId, fail],
  );

  const create = useCallback(
    async (prompt: string) => {
      setError(null);
      setCreating(true);
      try {
        onAppCreatedRef.current?.(await serverRef.current.createApp(prompt));
      } catch (e) {
        fail(e as Error);
      } finally {
        setCreating(false);
      }
    },
    [fail],
  );

  const clearError = useCallback(() => setError(null), []);

  return { items, phase, error, canSend: !creating && !waiting, send, create, clearError, messages: sorted };
}
