"use client";
import { useCallback, useEffect, useMemo, useRef } from "react";
import type { Base44App } from "./chat.types.js";
import type { Base44ChatProviderProps } from "./components.types.js";
import { ActionsContext, ComponentsContext, StateContext, type ResolvedComponents } from "./context.js";
import { fallbackMessageComponents } from "./fallbacks.js";
import { useBase44Chat } from "./useBase44Chat.js";

/**
 * Runs the AI chat for one app for the tree below it. It calls {@link useBase44Chat} once and
 * shares the result through context, so any component below reads it with {@link useChatState}
 * and {@link useChatActions}, and {@link Message} draws an item with your parts.
 *
 * Put it as high as the components that need the chat: a header that shows the status, a preview
 * that waits for the build, and the message list all read the same chat. It renders nothing of its
 * own.
 *
 * You pass a part for every question kind. The message parts, `Text` and `Step`, are optional:
 * one left out is drawn as plain HTML with no classes and a `data-base44` attribute for CSS.
 *
 * @param props - The {@link useBase44Chat} options, the parts, and the children.
 * @returns The children, inside the chat's contexts.
 *
 * @example
 * ```tsx
 * // The provider, a message list, and a composer of your own
 * <Base44ChatProvider appId={appId} backend={backend} onAppCreated={selectApp} components={{ question: { Choice, Secrets, Approval } }}>
 *   <Messages />
 *   <Composer />
 * </Base44ChatProvider>
 *
 * function Messages() {
 *   const { items } = useChatState();
 *   return items.map((item) => <div key={item.id} className={item.role}><Message item={item} /></div>);
 * }
 *
 * function Composer() {
 *   const { status } = useChatState();
 *   const { send } = useChatActions();
 *   const [prompt, setPrompt] = useState("");
 *   return (
 *     <form onSubmit={(e) => { e.preventDefault(); send(prompt); setPrompt(""); }}>
 *       <input value={prompt} onChange={(e) => setPrompt(e.target.value)} />
 *       <button disabled={status === "submitted" || status === "waiting"}>Send</button>
 *     </form>
 *   );
 * }
 * ```
 */
export function Base44ChatProvider({ components, children, appId, backend, onAppCreated }: Base44ChatProviderProps) {
  // The hook reads the backend through a ref already. The callback goes through one here, so an
  // inline `onAppCreated` keeps `create`, and every reader of the actions, stable.
  const onAppCreatedRef = useRef(onAppCreated);
  useEffect(() => {
    onAppCreatedRef.current = onAppCreated;
  });
  const reportAppCreated = useCallback((app: Base44App) => onAppCreatedRef.current?.(app), []);

  const { items, status, connection, error, send, create, clearError } = useBase44Chat({ appId, backend, onAppCreated: reportAppCreated });
  const state = useMemo(() => ({ items, status, connection, error }), [items, status, connection, error]);
  const actions = useMemo(() => ({ send, create, clearError }), [send, create, clearError]);

  // Merged part by part, so an inline `components={{…}}` with the same parts keeps the same identity.
  const { Text, Step } = components.message ?? {};
  const { Choice, Secrets, Approval } = components.question;
  const parts = useMemo<ResolvedComponents>(
    () => ({
      message: { Text: Text ?? fallbackMessageComponents.Text, Step: Step ?? fallbackMessageComponents.Step },
      question: { Choice, Secrets, Approval },
    }),
    [Text, Step, Choice, Secrets, Approval],
  );

  return (
    <ComponentsContext.Provider value={parts}>
      <ActionsContext.Provider value={actions}>
        <StateContext.Provider value={state}>{children}</StateContext.Provider>
      </ActionsContext.Provider>
    </ComponentsContext.Provider>
  );
}
