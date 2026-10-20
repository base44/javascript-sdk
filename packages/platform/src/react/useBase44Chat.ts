"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPlatformClient } from "../client/client.js";
import type { Message, StatusObject } from "../client/modules/chat.events.generated.js";
import { isWaitingForUser, mergeMessage, mergeSnapshot, pendingPromptItems, settlePendingPrompts, sortMessages, toItems, unknownKindToolCalls, waitingToolCallIds, type PendingPrompt } from "./chat-items.js";
import type { Base44Chat, Base44ChatOptions, ChatConnection, ChatError, ChatStatus } from "./chat.types.js";

// Base44's public status carries no reason, so a failed build has one error.
const BUILD_FAILED_ERROR: ChatError = { message: "The build failed", code: "build_failed" };
// The target of `submittedTo` while `create` runs, before the new app has an id.
const NEW_APP = "new-app";

/**
 * Runs the AI chat for one app in your own UI.
 *
 * The hook renders nothing. It gives you the conversation and the actions, and you draw them:
 * - Follows the app live, and renews its socket session when it expires.
 * - Turns Base44's messages into {@link ChatItem | items}, with each open question bound to the step it belongs to.
 * - Reports what the AI is doing in {@link Base44Chat.status}, and the live connection in {@link Base44Chat.connection}.
 * - Sends prompts, creates apps and answers questions through the {@link Base44ChatBackend | backend} you pass, so no credential reaches the browser.
 *
 * The actions never throw. A failure sets {@link Base44Chat.error}, and a question whose answer
 * failed opens again. The chat declines a question kind this release doesn't know.
 *
 * Requires a browser environment and can't be used in the backend.
 *
 * The chat follows `appId` when it's set. While `appId` is `null`, it follows the app
 * {@link Base44Chat.create} made, so passing the new ID back is optional. Any change to `appId`
 * forgets that app, so setting it back to `null` starts a new chat. Switching apps closes the old
 * session and starts over.
 *
 * @param options - The app to follow, your backend's calls, and what to do with a created app.
 * @returns The conversation, its status, connection and error, and the actions `send`, `create` and `clearError`.
 *
 * @example
 * ```typescript
 * // Draw the chat and answer an approval
 * const chat = useBase44Chat({ appId, backend, onAppCreated: selectApp });
 * return (
 *   <>
 *     {chat.items.map((item) => (
 *       <div key={item.id} className={item.role}>
 *         {item.text && <p>{item.text}</p>}
 *         {item.steps.map((step) =>
 *           step.question?.kind === "approval" ? (
 *             <button key={step.id} onClick={step.question.approve}>Allow {step.question.action}</button>
 *           ) : (
 *             <small key={step.id}>{step.label}</small>
 *           ),
 *         )}
 *       </div>
 *     ))}
 *     {chat.error && <p role="alert">{chat.error.message}</p>}
 *     <button onClick={() => (appId ? chat.send(prompt) : chat.create(prompt))}>Send</button>
 *   </>
 * );
 * ```
 */
export function useBase44Chat({ appId, backend, onAppCreated }: Base44ChatOptions): Base44Chat {
  const [messages, setMessages] = useState<Message[]>([]);
  const [buildState, setBuildState] = useState<StatusObject["state"]>();
  const [connection, setConnection] = useState<ChatConnection>("connecting");
  // A failed action's error, which the next action clears, and the connection's, which it doesn't.
  const [actionError, setActionError] = useState<ChatError | null>(null);
  const [connectionError, setConnectionError] = useState<ChatError | null>(null);
  // Tool calls answered here while Base44 still reports them waiting.
  const [answeredToolCallIds, setAnsweredToolCallIds] = useState<string[]>([]);
  // The app a prompt, a new app or an answer went to, until Base44 reacts to it.
  const [submittedTo, setSubmittedTo] = useState<string | null>(null);
  // Prompts sent from here, shown until Base44 has them.
  const [pendingPrompts, setPendingPrompts] = useState<PendingPrompt[]>([]);
  const pendingPromptCount = useRef(0);
  // Tool calls declined for the user, and those whose decline failed and may try again.
  const declinedToolCalls = useRef(new Set<string>());
  const failedDeclines = useRef(new Set<string>());
  // Tool calls answered from here whose submission ends when Base44 stops reporting them waiting.
  const answersAwaitingBase44 = useRef(new Set<string>());

  // The app `create` made, shown while `appId` is null. Any change to `appId` forgets it.
  const [createdAppId, setCreatedAppId] = useState<string | null>(null);
  const [previousAppIdProp, setPreviousAppIdProp] = useState(appId);
  const appIdPropChanged = previousAppIdProp !== appId;
  if (appIdPropChanged) {
    setPreviousAppIdProp(appId);
    setCreatedAppId(null);
  }
  // The app this chat shows.
  const currentAppId = appId ?? (appIdPropChanged ? null : createdAppId);

  // Switching apps starts over: the state resets in the same render that sees the new app.
  // A submission aimed at the new app, the one `create` just made, stays.
  const [stateAppId, setStateAppId] = useState(currentAppId);
  if (stateAppId !== currentAppId) {
    setStateAppId(currentAppId);
    setMessages([]);
    setBuildState(undefined);
    setConnection("connecting");
    setActionError(null);
    setConnectionError(null);
    setAnsweredToolCallIds([]);
    if (submittedTo !== currentAppId && submittedTo !== NEW_APP) setSubmittedTo(null);
    // Only the app `create` just handed over keeps its first prompt; any other is dropped, so it
    // can't reappear when that app is picked later.
    const handedOver = submittedTo !== null && submittedTo === currentAppId;
    setPendingPrompts(pendingPrompts.filter(prompt => prompt.appId === NEW_APP || (handedOver && prompt.appId === currentAppId)));
  }

  // The backend is read through a ref, kept current after every render, so an inline
  // `backend={{…}}` never reopens the socket or changes the actions' identity.
  const backendRef = useRef(backend);
  useEffect(() => {
    backendRef.current = backend;
  });
  // The app the chat follows now, so a call that finishes after a switch doesn't touch the new app.
  const followedAppIdRef = useRef(currentAppId);
  useEffect(() => {
    followedAppIdRef.current = currentAppId;
  }, [currentAppId]);
  const stillFollowing = (targetAppId: string | null) => followedAppIdRef.current === targetAppId;

  const reportActionError = useCallback(
    (error: unknown) => setActionError({ message: (error as Error)?.message || "Something went wrong", cause: error }),
    [],
  );

  // Live updates: a snapshot on every connect, then events.
  useEffect(() => {
    const followedAppId = currentAppId;
    if (!followedAppId) return;
    let closed = false;
    const reportConnectionError = (error: unknown) => {
      if (closed) return;
      setConnectionError({ message: (error as Error)?.message || "Live updates failed", code: (error as { code?: string })?.code, cause: error });
    };
    // A failure of the session or the subscription ends live updates: nothing retries after it.
    const endLiveUpdates = (error: unknown) => {
      reportConnectionError(error);
      if (!closed) setConnection("disconnected");
    };
    // A new reply ends the submission. A new user message is Base44's copy of a prompt, which
    // settles the pending one.
    const seenMessageIds = new Set<string>();
    const handleIncomingMessages = (incomingMessages: Message[]) => {
      const newMessages = incomingMessages.filter(message => message.id && !seenMessageIds.has(message.id));
      for (const message of incomingMessages) if (message.id) seenMessageIds.add(message.id);
      if (newMessages.some(message => message.role !== "user")) setSubmittedTo(null);
      const arrivedPrompts = newMessages.filter(message => message.role === "user").map(message => message.content ?? "");
      if (arrivedPrompts.length) {
        setPendingPrompts(prompts => settlePendingPrompts(prompts, followedAppId, arrivedPrompts));
      }
    };
    // A snapshot replaces the conversation when it is the first, or follows a rewrite of main
    // (undo, restore, sync); after a plain rejoin the messages before its window stay.
    let nextSnapshotReplaces = true;
    // Base44 can resend an earlier turn's status after the next turn has started: one older than
    // the newest seen is stale.
    let latestStatusDate = "";
    // A newer status, whatever its state, means Base44 has reacted, which ends the submission.
    const applyBuildStatus = (buildStatus: StatusObject | null | undefined) => {
      const statusDate = buildStatus?.last_updated_date ?? "";
      if (statusDate && statusDate < latestStatusDate) return;
      const isNewer = !!statusDate && statusDate > latestStatusDate;
      if (statusDate) latestStatusDate = statusDate;
      const state = buildStatus?.state;
      setBuildState(state);
      if (isNewer || state === "processing" || state === "error") setSubmittedTo(null);
    };

    // The client asks for a session on the first connect and whenever one expires, and forwards
    // no detail of a failed call, so the backend's own error is kept to report.
    let lastSessionError: unknown;
    const chatSession = createPlatformClient().chat.init({
      getSession: () =>
        backendRef.current.openLiveSession(followedAppId).then(
          socketSession => {
            lastSessionError = undefined;
            return socketSession;
          },
          (error: unknown) => {
            lastSessionError = error;
            throw error;
          },
        ),
      onError: error => {
        if (error.code !== "session_unavailable" || !lastSessionError) return endLiveUpdates(error);
        if (closed) return;
        setConnectionError({ message: (lastSessionError as Error)?.message || error.message, code: error.code, cause: lastSessionError });
        setConnection("disconnected");
      },
    });
    chatSession.subscribe(followedAppId, {
      onSnapshot: snapshot => {
        // A snapshot holds old prompts too, so only an exact match settles one.
        handleIncomingMessages(snapshot.messages);
        const replaceMessages = nextSnapshotReplaces;
        nextSnapshotReplaces = false;
        setMessages(heldMessages => (replaceMessages ? snapshot.messages : mergeSnapshot(heldMessages, snapshot.messages)));
        applyBuildStatus(snapshot.status);
        // A declined call that failed tries again on the next snapshot, after a reconnect.
        for (const declineKey of failedDeclines.current) declinedToolCalls.current.delete(declineKey);
        failedDeclines.current.clear();
        setConnection("connected");
      },
      onEvent: event => {
        if (event.type === "message.updated") {
          handleIncomingMessages([event.data.message]);
          setMessages(heldMessages => mergeMessage(heldMessages, event.data.message));
        }
        if (event.type === "message.removed") {
          setMessages(heldMessages => heldMessages.filter(message => message.id !== event.data.message_id));
        }
        if (event.type === "app.status_changed") applyBuildStatus(event.data.status);
        if (event.type === "conversation.changed" && event.data.branch_id == null) nextSnapshotReplaces = true;
        // A prompt sent while the AI is working waits in Base44's queue: Base44 has it, and it
        // stays pending until it runs.
        if (event.type === "queue.updated" && event.data.branch_id == null) setSubmittedTo(null);
      },
      // Only snapshot_unavailable leaves the subscription running.
      onError: error => ((error as { code?: string }).code === "snapshot_unavailable" ? reportConnectionError(error) : endLiveUpdates(error)),
    });
    // A failed connect also reaches onError, which reports it.
    chatSession.connect().catch(() => {});

    return () => {
      closed = true;
      chatSession.close();
    };
  }, [currentAppId]);

  // Answers one tool call. Its id leaves the answered list again if the submit fails, so the
  // question comes back.
  const submitAnswer = useCallback(
    (toolCallId: string, messageId: string, approve: boolean, extraUserInput?: Record<string, unknown>) => {
      if (!currentAppId) return Promise.resolve();
      const targetAppId = currentAppId;
      setActionError(null);
      setSubmittedTo(targetAppId);
      setAnsweredToolCallIds(ids => [...ids, toolCallId]);
      answersAwaitingBase44.current.add(toolCallId);
      const answer = { toolCallId, messageId, approve, extraUserInput };
      return backendRef.current.submitToolCallInput(targetAppId, answer).catch((error: unknown) => {
        answersAwaitingBase44.current.delete(toolCallId);
        if (!stillFollowing(targetAppId)) return;
        setAnsweredToolCallIds(ids => ids.filter(answeredId => answeredId !== toolCallId));
        setSubmittedTo(null);
        reportActionError(error);
      });
    },
    [currentAppId, reportActionError],
  );

  const sortedMessages = useMemo(() => sortMessages(messages), [messages]);
  const pendingForCurrentApp = useMemo(
    () => pendingPrompts.filter(prompt => prompt.appId === currentAppId || (prompt.appId === NEW_APP && !currentAppId)),
    [pendingPrompts, currentAppId],
  );
  const items = useMemo(
    () => [...toItems(sortedMessages, answeredToolCallIds, submitAnswer), ...pendingPromptItems(pendingForCurrentApp)],
    [sortedMessages, answeredToolCallIds, submitAnswer, pendingForCurrentApp],
  );
  const waitingForUser = useMemo(() => isWaitingForUser(sortedMessages, answeredToolCallIds), [sortedMessages, answeredToolCallIds]);

  // A kind this release doesn't know is declined once per tool call. If that fails, the step waits
  // again, the error shows, and the next snapshot tries once more.
  useEffect(() => {
    const followedAppId = currentAppId;
    if (!followedAppId) return;
    for (const { toolCallId, messageId } of unknownKindToolCalls(sortedMessages)) {
      const declineKey = `${followedAppId}:${toolCallId}`;
      if (declinedToolCalls.current.has(declineKey)) continue;
      declinedToolCalls.current.add(declineKey);
      setAnsweredToolCallIds(ids => [...ids, toolCallId]);
      backendRef.current.submitToolCallInput(followedAppId, { toolCallId, messageId, approve: false }).catch((error: unknown) => {
        failedDeclines.current.add(declineKey);
        setAnsweredToolCallIds(ids => ids.filter(answeredId => answeredId !== toolCallId));
        reportActionError(error);
      });
    }
  }, [currentAppId, sortedMessages, reportActionError]);

  // An answered call stays hidden while Base44 still reports it waiting, and is forgotten once it
  // doesn't: if Base44 parks it again, its question comes back.
  // An answer's submission ends there too: Base44 has taken it once the call no longer waits.
  useEffect(() => {
    const stillWaiting = waitingToolCallIds(sortedMessages);
    setAnsweredToolCallIds(ids => (ids.every(answeredId => stillWaiting.has(answeredId)) ? ids : ids.filter(answeredId => stillWaiting.has(answeredId))));
    let answerTaken = false;
    for (const toolCallId of answersAwaitingBase44.current) {
      if (stillWaiting.has(toolCallId)) continue;
      answersAwaitingBase44.current.delete(toolCallId);
      answerTaken = true;
    }
    if (answerTaken) setSubmittedTo(target => (target === followedAppIdRef.current ? null : target));
  }, [sortedMessages]);

  const submissionInFlight = (submittedTo === NEW_APP && !currentAppId) || (submittedTo !== null && submittedTo === currentAppId);
  let status: ChatStatus = "ready";
  if (buildState === "error") status = "error";
  else if (waitingForUser) status = "waiting";
  else if (buildState === "processing") status = "building";
  else if (submissionInFlight) status = "submitted";

  const addPendingPrompt = useCallback((content: string, targetAppId: string) => {
    const pendingPrompt = { id: `pending-${++pendingPromptCount.current}`, content, createdAt: new Date().toISOString(), appId: targetAppId };
    setPendingPrompts(prompts => [...prompts, pendingPrompt]);
    return pendingPrompt;
  }, []);

  const send = useCallback(
    (prompt: string) => {
      if (!currentAppId) {
        setActionError({ message: "There is no app to send to yet: create one first" });
        return Promise.resolve();
      }
      const targetAppId = currentAppId;
      setActionError(null);
      setSubmittedTo(targetAppId);
      const pendingPrompt = addPendingPrompt(prompt, targetAppId);
      return backendRef.current.sendMessage(targetAppId, prompt).catch((error: unknown) => {
        setPendingPrompts(prompts => prompts.filter(other => other !== pendingPrompt));
        if (!stillFollowing(targetAppId)) return;
        setSubmittedTo(null);
        reportActionError(error);
      });
    },
    [currentAppId, reportActionError, addPendingPrompt],
  );

  const create = useCallback(
    async (prompt: string) => {
      const startedFrom = followedAppIdRef.current;
      const followsSetApp = appId !== null;
      setActionError(null);
      setSubmittedTo(NEW_APP);
      const pendingPrompt = addPendingPrompt(prompt, NEW_APP);
      try {
        const app = await backendRef.current.createApp(prompt);
        setCreatedAppId(app.id);
        setSubmittedTo(app.id);
        // With appId set, the chat doesn't follow the new app, so its first prompt has nowhere to
        // show; the new app's own snapshot holds it once someone opens it.
        if (followsSetApp) setPendingPrompts(prompts => prompts.filter(other => other !== pendingPrompt));
        else setPendingPrompts(prompts => prompts.map(other => (other === pendingPrompt ? { ...other, appId: app.id } : other)));
        onAppCreated?.(app);
      } catch (error) {
        setPendingPrompts(prompts => prompts.filter(other => other !== pendingPrompt));
        if (!stillFollowing(startedFrom)) return;
        setSubmittedTo(null);
        reportActionError(error);
      }
    },
    [appId, onAppCreated, reportActionError, addPendingPrompt],
  );

  const clearError = useCallback(() => {
    setActionError(null);
    setConnectionError(null);
  }, []);

  const error = actionError ?? connectionError ?? (buildState === "error" ? BUILD_FAILED_ERROR : null);
  return { items, status, connection, error, send, create, clearError };
}
