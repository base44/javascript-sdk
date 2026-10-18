"use client";
import { createContext, useContext } from "react";
import type { ChatActions, ChatState, MessageComponents, QuestionComponents } from "./components.types.js";

/** @internal The parts with the fallbacks applied, as {@link Base44ChatProvider} shares them. */
export interface ResolvedComponents {
  message: MessageComponents;
  question: QuestionComponents;
}

/** @internal Filled by {@link Base44ChatProvider}. State changes on every event; actions and parts do not. */
export const StateContext = createContext<ChatState | null>(null);
/** @internal */
export const ActionsContext = createContext<ChatActions | null>(null);
/** @internal */
export const ComponentsContext = createContext<ResolvedComponents | null>(null);

/**
 * Reads the chat's state from the nearest {@link Base44ChatProvider}: `items`, `status`,
 * `connection` and `error`. A component that calls it re-renders on every live event.
 *
 * @returns The state of the chat the provider runs.
 * @throws {Error} When there is no provider above the component.
 *
 * @example
 * ```tsx
 * // The message list
 * function Messages() {
 *   const { items } = useChatState();
 *   return items.map((item) => <div key={item.id}><Message item={item} /></div>);
 * }
 * ```
 */
export function useChatState(): ChatState {
  return inside(useContext(StateContext), "useChatState");
}

/**
 * Reads the chat's actions from the nearest {@link Base44ChatProvider}: `send`, `create` and
 * `clearError`. They keep their identity while the app stays the same, also with an inline
 * `backend` or `onAppCreated`, so a component that reads only actions doesn't re-render when a
 * message arrives.
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

/** @internal The parts from the nearest provider. */
export function useResolvedComponents(component: string): ResolvedComponents {
  return inside(useContext(ComponentsContext), component);
}

function inside<T>(value: T | null, reader: string): T {
  if (!value) throw new Error(`${reader} needs a <Base44ChatProvider> above it`);
  return value;
}
