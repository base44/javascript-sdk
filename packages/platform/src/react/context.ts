import { createContext, useContext } from "react";
import type { ChatActions, ChatComponents, ChatState } from "./components.types.js";
import { fallbackComponents } from "./fallbacks.js";

/** @internal Filled by {@link Base44ChatProvider}. State changes on every event; actions and parts do not. */
export const StateContext = createContext<ChatState | null>(null);
/** @internal */
export const ActionsContext = createContext<ChatActions | null>(null);
/** @internal */
export const ComponentsContext = createContext<ChatComponents | null>(null);

/**
 * Reads the chat's state from the nearest {@link Base44ChatProvider}: the items, the phase,
 * the error and `canSend`. A component that calls it re-renders on every live event.
 *
 * @returns The state of the chat the provider runs.
 * @throws {Error} When there is no provider above the component.
 *
 * @example
 * ```tsx
 * // The message list
 * function Messages() {
 *   const { items } = useChatState();
 *   return items.map((item) => <Message key={item.id} item={item} />);
 * }
 * ```
 */
export function useChatState(): ChatState {
  return inside(useContext(StateContext), "useChatState");
}

/**
 * Reads the chat's actions from the nearest {@link Base44ChatProvider}: `send`, `create` and
 * `clearError`. They keep their identity for the life of the provider, so a component that
 * reads only actions never re-renders because a message arrived.
 *
 * @returns The actions of the chat the provider runs.
 * @throws {Error} When there is no provider above the component.
 *
 * @example
 * ```tsx
 * // A button outside the chat that starts a new app
 * function NewAppButton({ prompt }: { prompt: string }) {
 *   const { create } = useChatActions();
 *   return <button onClick={() => create(prompt)}>Create</button>;
 * }
 * ```
 */
export function useChatActions(): ChatActions {
  return inside(useContext(ActionsContext), "useChatActions");
}

/**
 * Reads the parts from the nearest {@link Base44ChatProvider}, merged with the unstyled
 * fallbacks. Outside a provider it returns the fallbacks, so {@link Message} also works over
 * {@link useBase44Chat} alone.
 *
 * @returns Every part, with the provider's replacements applied.
 *
 * @example
 * ```tsx
 * // A part that draws another part
 * function MyStepList({ steps }: { steps: ChatStep[] }) {
 *   const { message: { Step } } = useChatComponents();
 *   return steps.map((step) => <Step key={step.id} {...step} />);
 * }
 * ```
 */
export function useChatComponents(): ChatComponents {
  return useContext(ComponentsContext) ?? fallbackComponents;
}

function inside<T>(value: T | null, hook: string): T {
  if (!value) throw new Error(`${hook} needs a <Base44ChatProvider> above it`);
  return value;
}
