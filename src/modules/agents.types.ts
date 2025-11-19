import { AxiosInstance } from "axios";
import { RoomsSocket } from "../utils/socket-utils";
import { ModelFilterParams } from "../types";

/**
 * Reasoning information for an agent message.
 *
 * Contains details about the agent's reasoning process when generating a response.
 */
export type AgentMessageReasoning = {
  /** When reasoning started. */
  start_date: string;
  /** When reasoning ended. */
  end_date?: string;
  /** Reasoning content. */
  content: string;
};

/**
 * A tool call made by the agent.
 *
 * Represents a function or tool that the agent invoked during message generation.
 */
export type AgentMessageToolCall = {
  /** Tool call ID. */
  id: string;
  /** Name of the tool called. */
  name: string;
  /** Arguments passed to the tool as JSON string. */
  arguments_string: string;
  /** Status of the tool call. */
  status: "running" | "success" | "error" | "stopped";
  /** Results from the tool call. */
  results?: string | null;
};

/**
 * Token usage statistics for an agent message.
 *
 * Tracks the number of tokens consumed when generating the message.
 */
export type AgentMessageUsage = {
  /** Number of tokens in the prompt. */
  prompt_tokens?: number;
  /** Number of tokens in the completion. */
  completion_tokens?: number;
};

/**
 * Custom context provided with an agent message.
 *
 * Additional contextual information that can be passed to the agent.
 */
export type AgentMessageCustomContext = {
  /** Context message. */
  message: string;
  /** Associated data for the context. */
  data: Record<string, any>;
  /** Type of context. */
  type: string;
};

/**
 * Metadata about when and by whom a message was created.
 */
export type AgentMessageMetadata = {
  /** When the message was created. */
  created_date: string;
  /** Email of the user who created the message. */
  created_by_email: string;
  /** Full name of the user who created the message. */
  created_by_full_name: string | null;
};

/**
 * An agent conversation containing messages exchanged with an AI agent.
 */
export type AgentConversation = {
  /** Unique identifier for the conversation. */
  id: string;
  /** Application ID. */
  app_id: string;
  /** Name of the agent in this conversation. */
  agent_name: string;
  /** ID of the user who created the conversation. */
  created_by_id: string;
  /** Array of messages in the conversation. */
  messages: AgentMessage[];
  /** Optional metadata associated with the conversation. */
  metadata?: Record<string, any>;
};

/**
 * A message in an agent conversation.
 */
export type AgentMessage = {
  /** Unique identifier for the message. */
  id: string;
  /** Role of the message sender. */
  role: "user" | "assistant" | "system";
  /** Optional reasoning information for the message. */
  reasoning?: AgentMessageReasoning;
  /** Message content. */
  content?: string | Record<string, any> | null;
  /** URLs to files attached to the message. */
  file_urls?: string[] | null;
  /** Tool calls made by the agent. */
  tool_calls?: AgentMessageToolCall[] | null;
  /** Token usage statistics. */
  usage?: AgentMessageUsage | null;
  /** Whether the message is hidden from the user. */
  hidden?: boolean;
  /** Custom context provided with the message. */
  custom_context?: AgentMessageCustomContext[] | null;
  /** Model used to generate the message. */
  model?: string | null;
  /** Checkpoint ID for the message. */
  checkpoint_id?: string | null;
  /** Metadata about when and by whom the message was created. */
  metadata?: AgentMessageMetadata;
  /** Additional custom parameters for the message. */
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
 * **Authentication modes:**
 * - **User authentication** (`client.agents`): Access only conversations created by the authenticated user.
 * - **Service role authentication** (`client.asServiceRole.agents`): Access all conversations across all users.
 *
 * @example
 * ```typescript
 * // Create a new conversation
 * const conversation = await client.agents.createConversation({
 *   agent_name: 'support-agent',
 *   metadata: {
 *     ticket_id: 'SUPP-1234',
 *     category: 'billing',
 *     priority: 'high'
 *   }
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Send a message
 * await client.agents.addMessage(conversation, {
 *   role: 'user',
 *   content: 'Hello, I need help!'
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Subscribe to real-time updates
 * const unsubscribe = client.agents.subscribeToConversation(
 *   conversation.id,
 *   (updatedConversation) => {
 *     console.log('New messages:', updatedConversation.messages);
 *   }
 * );
 *
 * // Clean up subscription later
 * unsubscribe();
 * ```
 *
 */
export interface AgentsModule {
  /**
   * Gets all conversations.
   *
   * @returns Promise resolving to an array of conversations.
   *
   * @example
   * ```typescript
   * const conversations = await client.agents.getConversations();
   * console.log(`Total conversations: ${conversations.length}`);
   * ```
   */
  getConversations(): Promise<AgentConversation[]>;

  /**
   * Gets a specific conversation by ID.
   *
   * @param conversationId - The unique identifier of the conversation.
   * @returns Promise resolving to the conversation, or undefined if not found.
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
   * Lists conversations with filtering and pagination.
   *
   * @param filterParams - Filter parameters for querying conversations.
   * @returns Promise resolving to an array of filtered conversations.
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
   * Creates a new conversation with an agent.
   *
   * @param conversation - Conversation details including agent name and optional metadata.
   * @returns Promise resolving to the created conversation.
   *
   * @example
   * ```typescript
   * const conversation = await client.agents.createConversation({
   *   agent_name: 'support-agent',
   *   metadata: {
   *     order_id: 'ORD-789',
   *     product_id: 'PROD-456',
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
   * Adds a message to a conversation.
   *
   * Sends a message to the agent and updates the conversation. This method
   * also updates the real-time socket to notify any subscribers.
   *
   * @param conversation - The conversation to add the message to.
   * @param message - The message to add.
   * @returns Promise resolving to the created message.
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
   * Subscribes to real-time updates for a conversation.
   *
   * Establishes a WebSocket connection to receive instant updates when new
   * messages are added to the conversation. Returns an unsubscribe function
   * to clean up the connection.
   *
   * @param conversationId - The conversation ID to subscribe to.
   * @param onUpdate - Callback function called when the conversation is updated.
   * @returns Unsubscribe function to stop receiving updates.
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
   * Gets WhatsApp connection URL for an agent.
   *
   * Generates a URL that users can use to connect with the agent through WhatsApp.
   * The URL includes authentication if a token is available.
   *
   * @param agentName - The name of the agent.
   * @returns WhatsApp connection URL.
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
