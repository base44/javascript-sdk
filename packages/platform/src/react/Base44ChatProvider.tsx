"use client";
import { useMemo } from "react";
import type { Base44ChatProviderProps, ChatComponents } from "./components.types.js";
import { ActionsContext, ComponentsContext, StateContext } from "./context.js";
import { fallbackComponents } from "./fallbacks.js";
import { useBase44Chat } from "./useBase44Chat.js";

/**
 * Runs one app's builder chat for the tree below it. It calls {@link useBase44Chat} once and
 * shares the result through context, so any component below reads it with
 * {@link useChatState} and {@link useChatActions}, and {@link Message} finds its parts.
 *
 * Put it as high as the components that need the chat: around a header that shows the phase,
 * a preview that waits for the build, and the message list, they all read the same chat.
 * Renders nothing of its own.
 *
 * @param props - The {@link useBase44Chat} options, the parts to replace, and the children.
 * @returns The children, inside the chat's contexts.
 *
 * @example
 * ```tsx
 * // The provider, a message list, and a composer of your own
 * <Base44ChatProvider appId={appId} server={server} onAppCreated={selectApp} components={{ question: { Approval: MyApproval } }}>
 *   <Messages />
 *   <Composer />
 * </Base44ChatProvider>
 *
 * function Messages() {
 *   const { items } = useChatState();
 *   return items.map((item) => <div key={item.id}><Message item={item} /></div>);
 * }
 *
 * function Composer() {
 *   const { canSend } = useChatState();
 *   const { send } = useChatActions();
 *   const [prompt, setPrompt] = useState("");
 *   return (
 *     <form onSubmit={(e) => { e.preventDefault(); send(prompt); setPrompt(""); }}>
 *       <input value={prompt} onChange={(e) => setPrompt(e.target.value)} />
 *       <button disabled={!canSend}>Send</button>
 *     </form>
 *   );
 * }
 * ```
 */
export function Base44ChatProvider({ components, children, ...options }: Base44ChatProviderProps) {
  const { items, phase, error, canSend, messages, send, create, clearError } = useBase44Chat(options);
  const state = useMemo(() => ({ items, phase, error, canSend, messages }), [items, phase, error, canSend, messages]);
  const actions = useMemo(() => ({ send, create, clearError }), [send, create, clearError]);

  // Merged part by part, so an inline `components={{…}}` with the same parts keeps the same identity.
  const { Text, Step } = components?.message ?? {};
  const { Choice, Input, Approval, Unknown } = components?.question ?? {};
  const parts = useMemo<ChatComponents>(
    () => ({
      message: { Text: Text ?? fallbackComponents.message.Text, Step: Step ?? fallbackComponents.message.Step },
      question: {
        Choice: Choice ?? fallbackComponents.question.Choice,
        Input: Input ?? fallbackComponents.question.Input,
        Approval: Approval ?? fallbackComponents.question.Approval,
        Unknown: Unknown ?? fallbackComponents.question.Unknown,
      },
    }),
    [Text, Step, Choice, Input, Approval, Unknown],
  );

  return (
    <ComponentsContext.Provider value={parts}>
      <ActionsContext.Provider value={actions}>
        <StateContext.Provider value={state}>{children}</StateContext.Provider>
      </ActionsContext.Provider>
    </ComponentsContext.Provider>
  );
}
