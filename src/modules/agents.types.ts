import { AxiosInstance } from "axios";
import { RoomsSocket } from "../utils/socket-utils";
import { ModelFilterParams } from "../types";

/**
 * An agent conversation containing messages exchanged with an AI agent.
 */
export type AgentConversation = {
  /** Unique identifier for the conversation */
  id: string;
  /** Application ID */
  app_id: string;
  /** Name of the agent in this conversation */
  agent_name: string;
  /** ID of the user who created the conversation */
  created_by_id: string;
  /** Array of messages in the conversation */
  messages: AgentMessage[];
  /** Optional metadata associated with the conversation */
  metadata?: Record<string, any>;
};

/**
 * A message in an agent conversation.
 */
export type AgentMessage = {
  /** Unique identifier for the message */
  id: string;
  /** Role of the message sender */
  role: "user" | "assistant" | "system";
  /** Optional reasoning information for the message */
  reasoning?: {
    /** When reasoning started */
    start_date: string;
    /** When reasoning ended */
    end_date?: string;
    /** Reasoning content */
    content: string;
  };
  /** Message content (can be text or structured data) */
  content?: string | Record<string, any> | null;
  /** URLs to files attached to the message */
  file_urls?: string[] | null;
  /** Tool calls made by the agent */
  tool_calls?:
    | {
        /** Tool call ID */
        id: string;
        /** Name of the tool called */
        name: string;
        /** Arguments passed to the tool as JSON string */
        arguments_string: string;
        /** Status of the tool call */
        status: "running" | "success" | "error" | "stopped";
        /** Results from the tool call */
        results?: string | null;
      }[]
    | null;
  /** Token usage statistics */
  usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
  /** Whether the message is hidden from the user */
  hidden?: boolean;
  /** Custom context provided with the message */
  custom_context?:
    | { message: string; data: Record<string, any>; type: string }[]
    | null;
  /** Model used to generate the message */
  model?: string | null;
  /** Checkpoint ID for the message */
  checkpoint_id?: string | null;
  /** Metadata about when and by whom the message was created */
  metadata?: {
    created_date: string;
    created_by_email: string;
    created_by_full_name: string | null;
  };
  /** Additional custom parameters for the message */
  additional_message_params?: Record<string, any>;
};

/**
 * Configuration for creating the agents module.
 * @internal
 */
export type AgentsModuleConfig = {
  /** Axios instance for HTTP requests */
  axios: AxiosInstance;
  /** WebSocket instance for real-time updates */
  socket: ReturnType<typeof RoomsSocket>;
  /** Application ID */
  appId: string;
  /** Server URL */
  serverUrl?: string;
  /** Authentication token */
  token?: string;
};

/**
 * Agents module for managing AI agent conversations.
 *
 * This module provides methods to create and manage conversations with AI agents,
 * send messages, and subscribe to real-time updates. Conversations can be used
 * for chat interfaces, support systems, or any interactive AI application.
 *
 * **Real-time Updates:**
 * The agents module supports real-time updates through WebSocket subscriptions,
 * allowing you to receive instant notifications when new messages arrive.
 *
 * **Available with both auth modes:**
 * - User auth: `client.agents.method(...)`
 * - Service role: `client.asServiceRole.agents.method(...)`
 *
 * @example
 * ```typescript
 * // Create a new conversation
 * const conversation = await client.agents.createConversation({
 *   agent_name: 'support-agent',
 *   metadata: { user_id: 'user-123' }
 * });
 *
 * // Subscribe to real-time updates
 * const unsubscribe = client.agents.subscribeToConversation(
 *   conversation.id,
 *   (updatedConversation) => {
 *     console.log('New messages:', updatedConversation.messages);
 *   }
 * );
 *
 * // Send a message
 * await client.agents.addMessage(conversation, {
 *   role: 'user',
 *   content: 'Hello, I need help!'
 * });
 *
 * // Clean up subscription
 * unsubscribe();
 * ```
 */
export interface AgentsModule {
  /**
   * Get all conversations for the current user.
   *
   * Retrieves all agent conversations without filtering.
   *
   * @returns Promise resolving to an array of conversations
   *
   * @example
   * ```typescript
   * const conversations = await client.agents.getConversations();
   * console.log(`Total conversations: ${conversations.length}`);
   * ```
   */
  getConversations(): Promise<AgentConversation[]>;

  /**
   * Get a specific conversation by ID.
   *
   * @param conversationId - The unique identifier of the conversation
   * @returns Promise resolving to the conversation, or undefined if not found
   *
   * @example
   * ```typescript
   * const conversation = await client.agents.getConversation('conv-123');
   * if (conversation) {
   *   console.log(`Conversation has ${conversation.messages.length} messages`);
   * }
   * ```
   */
  getConversation(
    conversationId: string
  ): Promise<AgentConversation | undefined>;

  /**
   * List conversations with filtering and pagination.
   *
   * @param filterParams - Filter parameters for querying conversations
   * @returns Promise resolving to an array of filtered conversations
   *
   * @example
   * ```typescript
   * const recentConversations = await client.agents.listConversations({
   *   limit: 10,
   *   sort: '-created_date'
   * });
   * ```
   */
  listConversations(
    filterParams: ModelFilterParams
  ): Promise<AgentConversation[]>;

  /**
   * Create a new conversation with an agent.
   *
   * @param conversation - Conversation details including agent name and optional metadata
   * @returns Promise resolving to the created conversation
   *
   * @example
   * ```typescript
   * const conversation = await client.agents.createConversation({
   *   agent_name: 'support-agent',
   *   metadata: {
   *     user_id: 'user-123',
   *     category: 'technical-support'
   *   }
   * });
   * console.log(`Created conversation: ${conversation.id}`);
   * ```
   */
  createConversation(conversation: {
    agent_name: string;
    metadata?: Record<string, any>;
  }): Promise<AgentConversation>;

  /**
   * Add a message to a conversation.
   *
   * Sends a message to the agent and updates the conversation. This method
   * also updates the real-time socket to notify any subscribers.
   *
   * @param conversation - The conversation to add the message to
   * @param message - The message to add
   * @returns Promise resolving to the created message
   *
   * @example
   * ```typescript
   * const message = await client.agents.addMessage(conversation, {
   *   role: 'user',
   *   content: 'Hello, I need help with my order #12345'
   * });
   * console.log(`Message sent with ID: ${message.id}`);
   * ```
   */
  addMessage(
    conversation: AgentConversation,
    message: Partial<AgentMessage>
  ): Promise<AgentMessage>;

  /**
   * Subscribe to real-time updates for a conversation.
   *
   * Establishes a WebSocket connection to receive instant updates when new
   * messages are added to the conversation. Returns an unsubscribe function
   * to clean up the connection.
   *
   * @param conversationId - The conversation ID to subscribe to
   * @param onUpdate - Callback function called when the conversation is updated
   * @returns Unsubscribe function to stop receiving updates
   *
   * @example
   * ```typescript
   * const unsubscribe = client.agents.subscribeToConversation(
   *   'conv-123',
   *   (updatedConversation) => {
   *     const latestMessage = updatedConversation.messages[updatedConversation.messages.length - 1];
   *     console.log('New message:', latestMessage.content);
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

  /**
   * Get WhatsApp connection URL for an agent.
   *
   * Generates a URL that users can use to connect with the agent through WhatsApp.
   * The URL includes authentication if a token is available.
   *
   * @param agentName - The name of the agent
   * @returns WhatsApp connection URL
   *
   * @example
   * ```typescript
   * const whatsappUrl = client.agents.getWhatsAppConnectURL('support-agent');
   * console.log(`Connect through WhatsApp: ${whatsappUrl}`);
   * // User can open this URL to start a WhatsApp conversation
   * ```
   */
  getWhatsAppConnectURL(agentName: string): string;
}
