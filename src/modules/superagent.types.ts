import { ModelFilterParams } from "../types.js";
import { AgentConversation, AgentMessage } from "./agents.types.js";

// Superagent conversations share the same wire shapes as agent conversations.
// Re-export them so consumers can type superagent results without reaching
// into agents.types.
export type {
  AgentConversation,
  AgentMessage,
  AgentMessageReasoning,
  AgentMessageToolCall,
  AgentMessageUsage,
  AgentMessageCustomContext,
  AgentMessageMetadata,
} from "./agents.types.js";

/**
 * Parameters for creating a new superagent conversation.
 *
 * Unlike {@linkcode CreateConversationParams | agent conversations}, no agent
 * name is accepted: a public superagent is always exposed under a single
 * fixed agent name, which the SDK sets internally.
 */
export interface CreateSuperagentConversationParams {
  /** Optional metadata to attach to the conversation. */
  metadata?: Record<string, any>;
}

/**
 * Configuration for creating the superagent module.
 * @internal
 */
export interface SuperagentModuleConfig {
  /** Server URL */
  serverUrl: string;
  /** Additional headers to include in API requests */
  headers?: Record<string, string>;
  /** Optional error handler for API errors */
  onError?: (error: Error) => void;
}

/**
 * A handle bound to a specific public superagent app.
 *
 * A public superagent is a separate Base44 app linked to a host app, serving
 * the host app's end users as an anonymous-visitor chat agent. All requests
 * made through a handle target the superagent app's ID and are sent
 * anonymously: no Authorization token is attached, and the caller is
 * identified by a stable anonymous visitor ID instead (the
 * `X-Base44-Anonymous-Id` header on HTTP requests, and the `anonymous_id`
 * handshake parameter on the realtime socket).
 */
export interface SuperagentHandle {
  /**
   * Creates a new conversation with the public superagent.
   *
   * The agent name is set internally — a public superagent always exposes a
   * single fixed agent.
   *
   * @param params - Optional conversation parameters (metadata).
   * @returns Promise resolving to the created conversation.
   *
   * @example
   * ```typescript
   * const agent = base44.superagent.forApp('superagent-app-id');
   * const conversation = await agent.createConversation({
   *   metadata: { source: 'help-widget' }
   * });
   * ```
   */
  createConversation(
    params?: CreateSuperagentConversationParams
  ): Promise<AgentConversation>;

  /**
   * Lists the current anonymous visitor's conversations with the superagent.
   *
   * @param filterParams - Optional filter parameters for querying conversations.
   * @returns Promise resolving to an array of conversations.
   *
   * @example
   * ```typescript
   * const conversations = await agent.listConversations();
   * ```
   */
  listConversations(
    filterParams?: ModelFilterParams
  ): Promise<AgentConversation[]>;

  /**
   * Gets a specific conversation by ID, including its full message history.
   *
   * @param conversationId - The unique identifier of the conversation.
   * @returns Promise resolving to the conversation, or undefined if not found.
   */
  getConversation(
    conversationId: string
  ): Promise<AgentConversation | undefined>;

  /**
   * Adds a message to a conversation.
   *
   * Sends a message to the superagent and updates the conversation. The
   * agent's response is delivered through the realtime subscription (see
   * {@linkcode subscribeToConversation | subscribeToConversation()}).
   *
   * @param conversation - The conversation to add the message to.
   * @param message - The message to add.
   * @returns Promise resolving to the created message.
   *
   * @example
   * ```typescript
   * await agent.addMessage(conversation, {
   *   role: 'user',
   *   content: 'How do I reset my password?'
   * });
   * ```
   */
  addMessage(
    conversation: AgentConversation,
    message: Partial<AgentMessage>
  ): Promise<AgentMessage>;

  /**
   * Subscribes to realtime updates for a conversation.
   *
   * Establishes a dedicated anonymous WebSocket connection to the superagent
   * app and receives instant updates when messages are added or updated.
   * Returns an unsubscribe function to clean up the subscription.
   *
   * @param conversationId - The conversation ID to subscribe to.
   * @param onUpdate - Callback invoked with the updated conversation.
   * @returns Unsubscribe function to stop receiving updates.
   *
   * @example
   * ```typescript
   * const unsubscribe = agent.subscribeToConversation(
   *   conversation.id,
   *   (updated) => {
   *     const latest = updated.messages[updated.messages.length - 1];
   *     console.log('New message:', latest.content);
   *   }
   * );
   *
   * // Later, clean up the subscription
   * unsubscribe();
   * ```
   */
  subscribeToConversation(
    conversationId: string,
    onUpdate?: (conversation: AgentConversation) => void
  ): () => void;
}

/**
 * Superagent module for chatting with an app's linked public superagent.
 *
 * A host app can have a linked "public superagent" — a separate Base44 app
 * that serves the host app's end users as a chat agent without requiring
 * them to sign in. This module provides anonymous access to that superagent
 * app: it never uses the host app's authentication token. Instead, requests
 * carry a stable anonymous visitor ID so the backend can group conversations
 * per visitor.
 *
 * @example
 * ```typescript
 * const agent = base44.superagent.forApp('superagent-app-id');
 *
 * const conversation = await agent.createConversation();
 * const unsubscribe = agent.subscribeToConversation(
 *   conversation.id,
 *   (updated) => console.log(updated.messages)
 * );
 * await agent.addMessage(conversation, { role: 'user', content: 'Hi!' });
 * ```
 */
export interface SuperagentModule {
  /**
   * Gets a handle bound to a public superagent app.
   *
   * Handles are cached per app ID, so repeated calls with the same ID return
   * the same handle (and reuse its HTTP client and socket connection).
   *
   * @param appId - The superagent app's ID (not the host app's ID).
   * @returns A handle for interacting with the superagent.
   */
  forApp(appId: string): SuperagentHandle;

  /**
   * Disconnects all superagent socket connections.
   * @internal
   */
  cleanup(): void;
}
