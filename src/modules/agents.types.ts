import { AxiosInstance } from "axios";
import { RoomsSocket } from "../utils/socket-utils";
import { ModelFilterParams } from "../types";

/**
 * Reasoning information for an agent message.
 *
 * Contains details about the agent's reasoning process when generating a response.
 */
export interface AgentMessageReasoning {
  /** When reasoning started. */
  start_date: string;
  /** When reasoning ended. */
  end_date?: string;
  /** Reasoning content. */
  content: string;
}

/**
 * A tool call made by the agent.
 *
 * Represents a function or tool that the agent invoked during message generation.
 */
export interface AgentMessageToolCall {
  /** Tool call ID. */
  id: string;
  /** Name of the tool called. */
  name: string;
  /** Arguments passed to the tool as JSON string. */
  arguments_string: string;
  /** Status of the tool call. */
  status: "running" | "success" | "error" | "stopped";
  /** Results from the tool call. */
  results?: string;
}

/**
 * Token usage statistics for an agent message.
 *
 * Tracks the number of tokens consumed when generating the message.
 */
export interface AgentMessageUsage {
  /** Number of tokens in the prompt. */
  prompt_tokens?: number;
  /** Number of tokens in the completion. */
  completion_tokens?: number;
}

/**
 * Custom context provided with an agent message.
 *
 * Additional contextual information that can be passed to the agent.
 */
export interface AgentMessageCustomContext {
  /** Context message. */
  message: string;
  /** Associated data for the context. */
  data: Record<string, any>;
  /** Type of context. */
  type: string;
}

/**
 * Metadata about when and by whom a message was created.
 */
export interface AgentMessageMetadata {
  /** When the message was created. */
  created_date: string;
  /** Email of the user who created the message. */
  created_by_email: string;
  /** Full name of the user who created the message. */
  created_by_full_name: string;
}

/**
 * An agent conversation containing messages exchanged with an AI agent.
 */
export interface AgentConversation {
  /** Unique identifier for the conversation. */
  id: string;
  /** Application ID. */
  app_id: string;
  /** Name of the agent in this conversation. */
  agent_name: string;
  /** ID of the user who created the conversation. */
  created_by_id: string;
  /** When the conversation was created. */
  created_date: string;
  /** When the conversation was last updated. */
  updated_date: string;
  /** Array of messages in the conversation. */
  messages: AgentMessage[];
  /** Optional metadata associated with the conversation. */
  metadata?: Record<string, any>;
}

/**
 * A message in an agent conversation.
 */
export interface AgentMessage {
  /** Unique identifier for the message. */
  id: string;
  /** Role of the message sender. */
  role: "user" | "assistant" | "system";
  /** When the message was created. */
  created_date: string;
  /** When the message was last updated. */
  updated_date: string;
  /** Optional reasoning information for the message. */
  reasoning?: AgentMessageReasoning | null;
  /** Message content. */
  content?: string | Record<string, any>;
  /** URLs to files attached to the message. */
  file_urls?: string[];
  /** Tool calls made by the agent. */
  tool_calls?: AgentMessageToolCall[];
  /** Token usage statistics. */
  usage?: AgentMessageUsage;
  /** Whether the message is hidden from the user. */
  hidden?: boolean;
  /** Custom context provided with the message. */
  custom_context?: AgentMessageCustomContext[];
  /** Model used to generate the message. */
  model?: string;
  /** Checkpoint ID for the message. */
  checkpoint_id?: string;
  /** Metadata about when and by whom the message was created. */
  metadata?: AgentMessageMetadata;
  /** Additional custom parameters for the message. */
  additional_message_params?: Record<string, any>;
}

/**
 * Parameters for creating a new conversation.
 */
export interface CreateConversationParams {
  /** The name of the agent to create a conversation with. */
  agent_name: string;
  /** Optional metadata to attach to the conversation. */
  metadata?: Record<string, any>;
}

/**
 * Configuration for creating the agents module.
 * @internal
 */
export interface AgentsModuleConfig {
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
}

/**
 * Agents module for managing AI agent conversations.
 *
 * This module provides methods to create and manage conversations with AI agents,
 * send messages, and subscribe to real-time updates. Conversations can be used
 * for chat interfaces, support systems, or any interactive AI app.
 *
 * The agents module enables you to:
 *
 * - **Create conversations** with agents defined in the app.
 * - **Send messages** from users to agents and receive AI-generated responses.
 * - **Retrieve conversations** individually or as filtered lists with sorting and pagination.
 * - **Subscribe to real-time updates** using WebSocket connections to receive instant notifications when new messages arrive.
 * - **Attach metadata** to conversations for tracking context, categories, priorities, or linking to external systems.
 * - **Generate WhatsApp connection URLs** for users to interact with agents through WhatsApp.
 *
 * The agents module operates with a two-level hierarchy:
 *
 * 1. **Conversations**: Top-level containers that represent a dialogue with a specific agent. Each conversation has a unique ID, is associated with an agent by name, and belongs to the user who created it. Conversations can include optional metadata for tracking app-specific context like ticket IDs, categories, or custom fields.
 *
 * 2. **Messages**: Individual exchanges within a conversation. Each message has a role, content, and optional metadata like token usage, tool calls, file attachments, and reasoning information. Messages are stored as an array within their parent conversation.
 *
 * This module is available to use with a client in all authentication modes:
 *
 * - **Anonymous or User authentication** (`base44.agents`): Access is scoped to the current user's permissions. Anonymous users can create conversations but cannot retrieve them later, while authenticated users can access conversations they created.
 * - **Service role authentication** (`base44.asServiceRole.agents`): Operations have elevated admin-level permissions. Can access all conversations that the app's admin role has access to.
 *
 */
export interface AgentsModule {
  /**
   * Gets all conversations from all agents in the app.
   *
   * Retrieves all conversations. Use {@linkcode listConversations | listConversations()} to filter which conversations are returned, apply sorting, or paginate results. Use {@linkcode getConversation | getConversation()} to retrieve a specific conversation by ID.
   *
   * @returns Promise resolving to an array of conversations.
   *
   * @example
   * ```typescript
   * // Get all conversations
   * const conversations = await base44.agents.getConversations();
   * console.log(`Total conversations: ${conversations.length}`);
   * ```
   *
   * @see {@linkcode listConversations | listConversations()} for filtering, sorting, and pagination
   * @see {@linkcode getConversation | getConversation()} for retrieving a specific conversation by ID
   */
  getConversations(): Promise<AgentConversation[]>;

  /**
   * Gets a specific conversation by ID.
   *
   * Retrieves a single conversation using its unique identifier. To retrieve
   * all conversations, use {@linkcode getConversations | getConversations()} To filter, sort, or paginate conversations, use {@linkcode listConversations | listConversations()}.
   *
   * @param conversationId - The unique identifier of the conversation.
   * @returns Promise resolving to the conversation, or undefined if not found.
   *
   * @example
   * ```typescript
   * // Get a specific conversation by ID
   * const conversation = await base44.agents.getConversation('conv-123');
   * if (conversation) {
   *   console.log(`Conversation has ${conversation.messages.length} messages`);
   * }
   * ```
   *
   * @see {@linkcode getConversations | getConversations()} for retrieving all conversations
   * @see {@linkcode listConversations | listConversations()} for filtering and sorting conversations
   */
  getConversation(
    conversationId: string
  ): Promise<AgentConversation | undefined>;

  /**
   * Lists conversations with filtering, sorting, and pagination.
   *
   * Provides querying capabilities including filtering by fields, sorting, pagination, and field selection. For cases where you need all conversations without filtering, use {@linkcode getConversations | getConversations()}. To retrieve a specific conversation by ID, use {@linkcode getConversation | getConversation()}.
   *
   * @param filterParams - Filter parameters for querying conversations.
   * @returns Promise resolving to an array of filtered conversations.
   *
   * @example
   * ```typescript
   * // List recent conversations with pagination
   * const recentConversations = await base44.agents.listConversations({
   *   limit: 10,
   *   sort: '-created_date'
   * });
   * ```
   *
   * @example
   * ```typescript
   * // Filter by agent and metadata
   * const supportConversations = await base44.agents.listConversations({
   *   q: {
   *     agent_name: 'support-agent',
   *     'metadata.priority': 'high'
   *   },
   *   sort: '-created_date',
   *   limit: 20
   * });
   * ```
   *
   * @see {@linkcode getConversations | getConversations()} for retrieving all conversations without filtering
   * @see {@linkcode getConversation | getConversation()} for retrieving a specific conversation by ID
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
   * // Create a new conversation with metadata
   * const conversation = await base44.agents.createConversation({
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
  createConversation(
    conversation: CreateConversationParams
  ): Promise<AgentConversation>;

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
   * // Send a message to the agent
   * const message = await base44.agents.addMessage(conversation, {
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
   * // Subscribe to real-time updates
   * const unsubscribe = base44.agents.subscribeToConversation(
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
   * // Get WhatsApp connection URL
   * const whatsappUrl = base44.agents.getWhatsAppConnectURL('support-agent');
   * console.log(`Connect through WhatsApp: ${whatsappUrl}`);
   * // User can open this URL to start a WhatsApp conversation
   * ```
   */
  getWhatsAppConnectURL(agentName: string): string;
}
