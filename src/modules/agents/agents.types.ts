import { AxiosInstance } from "axios";
import { RoomsSocket } from "../../utils/socket-utils.js";
import { ModelFilterParams } from "../../types.js";

/**
 * A JSON Schema object describing a tool's input parameters.
 * Use the standard JSON Schema `object` shape: `{ type: "object", properties: {...}, required: [...] }`.
 */
export type JSONSchema = Record<string, unknown>;

/**
 * A tool an agent can call. Create one with {@linkcode tool | tool()}, or derive it from a
 * resource with `.asTool()`.
 */
export interface Tool {
  /** Natural-language description the model uses to decide when to call the tool. */
  description: string;
  /** JSON Schema for the tool's arguments. */
  parameters: JSONSchema;
  /** Runs the tool. Receives parsed arguments; returns any JSON-serializable value (or a string). */
  execute: (args: any) => Promise<unknown> | unknown;
}

/**
 * Why the agent run ended.
 * `"max_steps"` is set by the SDK when the step cap is hit; all other values come from the model/normalization layer.
 */
export type FinishReason = "stop" | "length" | "tool-calls" | "content-filter" | "error" | "other";

/** An OpenAI-shaped chat message accepted by {@linkcode Agent.run}. */
export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

/** One iteration of the agent loop: the tool calls the model made and their results. */
export interface Step {
  toolResults: Array<{
    toolCallId: string;
    toolName: string;
    args: unknown;
    result: string;
  }>;
  /** Token/credit usage of the model call that produced this step's tool calls. */
  usage?: RunUsage;
}

/** Token/credit usage for a single model call or a sum across calls. `credits` is the Base44 gateway's `base44_credits`. */
export interface RunUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  credits?: number;
}

/** Result of {@linkcode Agent.run}. */
export interface RunResult {
  /** The model's final text output. */
  text: string;
  /** The loop history (one entry per step that made tool calls). */
  steps: Step[];
  /**
   * Why the run ended.
   * Values come from the model/normalization layer (`"stop"`, `"length"`, `"tool-calls"`, `"content-filter"`, `"error"`, `"other"`)
   * or from the SDK itself (`"max_steps"`, set when the step cap is reached).
   */
  finishReason: FinishReason | "max_steps";
  /** Token and credit usage from the final completion. */
  usage: RunUsage;
  /** Summed across all model calls in the loop; `usage` is the final call only. */
  totalUsage: RunUsage;
  /** The raw final completion body, for advanced use. */
  raw: unknown;
}

/** Input to {@linkcode Agent.run}: either a single prompt or a full message list. */
export type RunInput = { prompt: string } | { messages: ChatMessage[] };

/**
 * Per-run options passed as the second argument to {@linkcode Agent.run}.
 *
 * @example
 * ```typescript
 * const controller = new AbortController();
 * setTimeout(() => controller.abort(), 10_000);
 *
 * const result = await agent.run(
 *   { prompt: "Summarize last month's sales." },
 *   { abortSignal: controller.signal },
 * );
 * ```
 */
export interface RunOptions {
  /** Abort the run (and the in-flight gateway request). */
  abortSignal?: AbortSignal;
}

/** OpenAI-compatible tool choice. */
export type ToolChoice =
  | "auto"
  | "none"
  | "required"
  | { type: "function"; function: { name: string } };

/**
 * Configuration for a code-defined agent passed to {@linkcode AgentsModule.create}.
 *
 * @example
 * ```typescript
 * const agent = base44.agents.create({
 *   model: "claude_sonnet_4_6",
 *   system: "You are a concise travel planner.",
 *   tools: { getWeather, searchFlights },
 *   maxSteps: 5,
 * });
 * ```
 */
export interface AgentConfig {
  /**
   * Model alias or vendor model ID to use for this agent.
   *
   * Use a Base44 model alias (e.g. `"claude_sonnet_4_6"`, `"gpt_4o"`, `"gpt_5_mini"`) or a
   * fully-qualified vendor ID. Available aliases are listed in the Base44 console.
   */
  model: string;
  /**
   * System prompt prepended to every run.
   *
   * Provide instructions, persona, or constraints for the model.
   * Omit to let the model run without a system message.
   */
  system?: string;
  /**
   * Tools the agent may call, keyed by their function name.
   *
   * Each value must be a {@linkcode Tool} object — use the {@linkcode tool | tool()} factory
   * to create one, or use `.asTool()` on a resource such as an entity or function.
   *
   * @example
   * ```typescript
   * import { tool } from "@base44/sdk";
   *
   * const getWeather = tool({
   *   description: "Get the current weather for a city.",
   *   parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] },
   *   execute: async ({ city }) => fetch(`/weather?city=${city}`).then(r => r.json()),
   * });
   *
   * const agent = base44.agents.create({ model: "claude_sonnet_4_6", tools: { getWeather } });
   * ```
   */
  tools?: Record<string, Tool>;
  /**
   * Maximum number of tool-calling loop iterations before the run stops.
   *
   * Each iteration is one round-trip to the model. If the model keeps calling tools
   * and this limit is reached, the run ends with `finishReason: "max_steps"`.
   * Defaults to `8`.
   */
  maxSteps?: number;
  /**
   * Sampling temperature passed to the model.
   *
   * Controls output randomness: lower values (e.g. `0`) produce more deterministic
   * responses; higher values (e.g. `1`) increase variety. Omit to use the model default.
   *
   * Note: GPT-5 series models only accept `temperature: 1`.
   */
  temperature?: number;
  /**
   * JSON Schema to constrain the model's output to structured JSON.
   *
   * When set, the request is sent with `response_format: { type: "json_schema", … }`.
   * The model's response will be valid JSON matching the schema; access it by parsing
   * `RunResult.text`.
   * The schema is sent with strict JSON-schema mode, so it should have `additionalProperties: false` and list every property in `required` (otherwise the provider may reject it).
   *
   * @example
   * ```typescript
   * const agent = base44.agents.create({
   *   model: "claude_sonnet_4_6",
   *   responseFormat: {
   *     type: "object",
   *     properties: { summary: { type: "string" }, score: { type: "number" } },
   *     required: ["summary", "score"],
   *   },
   * });
   * const { text } = await agent.run({ prompt: "Rate this product description." });
   * const { summary, score } = JSON.parse(text);
   * ```
   */
  responseFormat?: JSONSchema;
  /**
   * Controls whether and which tool the model must call.
   *
   * - `"auto"` (default when tools are provided): the model decides.
   * - `"none"`: the model must not call any tool.
   * - `"required"`: the model must call at least one tool.
   * - `{ type: "function", function: { name } }`: force a specific tool.
   */
  toolChoice?: ToolChoice;
}

/**
 * A reusable code-defined agent returned by {@linkcode AgentsModule.create}.
 *
 * An agent runs a multi-step tool-calling loop: it sends messages to the model,
 * executes any tool calls the model requests, feeds the results back, and repeats
 * until the model produces a final answer or `maxSteps` is reached.
 *
 * @example
 * ```typescript
 * const agent = base44.agents.create({
 *   model: "claude_sonnet_4_6",
 *   system: "You are a concise travel planner.",
 *   tools: { getWeather },
 * });
 *
 * const { text } = await agent.run({ prompt: "What's the weather like in Tel Aviv?" });
 * console.log(text);
 * ```
 */
export interface Agent {
  /**
   * Runs the agent's tool-calling loop to completion and returns the final result.
   *
   * Builds an initial message list from `input`, then repeatedly calls the model,
   * executes any tool calls, and feeds results back until the model stops or
   * `maxSteps` (from {@linkcode AgentConfig}) is reached.
   *
   * Tool errors are fed back to the model as tool results rather than thrown, so
   * the model can recover or explain the failure.
   *
   * @param input - The run input: either `{ prompt: string }` for a simple user
   *   message, or `{ messages: ChatMessage[] }` to supply a full conversation history.
   * @param options - Optional {@linkcode RunOptions} (e.g. an `AbortSignal`).
   * @returns Promise resolving to a {@linkcode RunResult} containing the model's
   *   final text, per-step tool call history, finish reason, and token/credit usage.
   *
   * @example
   * ```typescript
   * // Simple prompt
   * const { text, usage } = await agent.run({ prompt: "Plan a one-day trip to Haifa." });
   * console.log(text);
   * console.log(`Credits used: ${usage.credits}`);
   * ```
   *
   * @example
   * ```typescript
   * // Supply a full message history
   * const { text } = await agent.run({
   *   messages: [
   *     { role: "user", content: "What is the capital of France?" },
   *     { role: "assistant", content: "Paris." },
   *     { role: "user", content: "And what is the population?" },
   *   ],
   * });
   * ```
   *
   * @example
   * ```typescript
   * // Cancel a long-running run
   * const controller = new AbortController();
   * setTimeout(() => controller.abort(), 15_000);
   * const { text } = await agent.run(
   *   { prompt: "Summarize all open support tickets." },
   *   { abortSignal: controller.signal },
   * );
   * ```
   */
  run(input: RunInput, options?: RunOptions): Promise<RunResult>;

  /**
   * Wraps this agent as a {@linkcode Tool} so another agent can call it as a sub-agent.
   *
   * The returned tool exposes a single `prompt` parameter. When called, it invokes
   * {@linkcode Agent.run | run()} with that prompt and returns the text result.
   * Use this to build agent hierarchies where a coordinator agent delegates tasks
   * to specialized sub-agents.
   *
   * @param opts - Options for the tool wrapper.
   * @param opts.description - Required. Natural-language description the calling
   *   model uses to decide when to invoke this sub-agent.
   * @param opts.name - Optional display name for the tool. Defaults to the
   *   agent config's model alias when omitted.
   * @returns A {@linkcode Tool} that can be passed in another agent's `tools` map.
   * @note The sub-agent runs independently — the parent's `abortSignal` is not propagated and
   *   the sub-agent's token/credit usage is not included in the parent's `totalUsage`.
   *
   * @example
   * ```typescript
   * const researchAgent = base44.agents.create({
   *   model: "claude_sonnet_4_6",
   *   tools: { webSearch },
   * });
   *
   * const writerAgent = base44.agents.create({
   *   model: "claude_sonnet_4_6",
   *   tools: {
   *     research: researchAgent.asTool({
   *       description: "Search the web and return a research summary.",
   *     }),
   *   },
   * });
   *
   * const { text } = await writerAgent.run({ prompt: "Write a blog post about coral reefs." });
   * ```
   */
  asTool(opts: { name?: string; description: string }): Tool;
}

/**
 * Registry of agent names. The [`types generate`](/developers/references/cli/commands/types-generate) command fills this registry, then [`AgentName`](#agentname) resolves to a union of the keys.
 */
export interface AgentNameRegistry {}

/**
 * Union of all agent names from the [`AgentNameRegistry`](#agentnameregistry). Defaults to `string` when no types have been generated.
 *
 * @example
 * ```typescript
 * // Using generated agent name types
 * // With generated types, you get autocomplete on agent names
 * const conversation = await base44.agents.createConversation({ agent_name: 'SupportBot' });
 * ```
 */
export type AgentName = keyof AgentNameRegistry extends never
  ? string
  : keyof AgentNameRegistry;

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
  status: "running" | "success" | "error" | "stopped" | "waiting_for_user_input";
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
  /** App ID. */
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
  agent_name: AgentName;
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
  /** Function to get WebSocket instance for realtime updates (lazy initialization) */
  getSocket: () => ReturnType<typeof RoomsSocket>;
  /** App ID */
  appId: string;
  /** Server URL */
  serverUrl?: string;
  /** Authentication token */
  token?: string;
  /** Returns the current bearer token at call time (thunk — never a captured string). Used by `create()`. */
  getToken?: () => string | undefined;
}

/**
 * Agents module for managing AI agent conversations.
 *
 * This module provides methods to create and manage conversations with AI agents,
 * send messages, and subscribe to realtime updates. Conversations can be used
 * for chat interfaces, support systems, or any interactive AI app.
 *
 * ## Key Features
 *
 * The agents module enables you to:
 *
 * - **Create conversations** with agents defined in the app.
 * - **Send messages** from users to agents and receive AI-generated responses.
 * - **Retrieve conversations** individually or as filtered lists with sorting and pagination.
 * - **Subscribe to realtime updates** using WebSocket connections to receive instant notifications when new messages arrive.
 * - **Attach metadata** to conversations for tracking context, categories, priorities, or linking to external systems.
 * - **Generate WhatsApp connection URLs** for users to interact with agents through WhatsApp.
 *
 * ## Conversation Structure
 *
 * The agents module operates with a two-level hierarchy:
 *
 * 1. **Conversations**: Top-level containers that represent a dialogue with a specific agent. Each conversation has a unique ID, is associated with an agent by name, and belongs to the user who created it. Conversations can include optional metadata for tracking app-specific context like ticket IDs, categories, or custom fields.
 *
 * 2. **Messages**: Individual exchanges within a conversation. Each message has a role, content, and optional metadata like token usage, tool calls, file attachments, and reasoning information. Messages are stored as an array within their parent conversation.
 *
 * ## Authentication Modes
 *
 * This module is available to use with a client in all authentication modes:
 *
 * - **Anonymous or User authentication** (`base44.agents`): Access is scoped to the current user's permissions. Users must be authenticated to create and access conversations.
 * - **Service role authentication** (`base44.asServiceRole.agents`): Operations have elevated admin-level permissions. Can access all conversations that the app's admin role has access to.
 *
 * ## Generated Types
 *
 * If you're working in a TypeScript project, you can generate types from your agents to get autocomplete on agent names when creating conversations or subscribing to updates. See the [Dynamic Types](/developers/references/sdk/getting-started/dynamic-types) guide to get started.
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
   * all conversations, use {@linkcode getConversations | getConversations()}. To filter, sort, or paginate conversations, use {@linkcode listConversations | listConversations()}.
   *
   * This function returns the complete stored conversation including full tool call results, even for large responses.
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
   * also updates the realtime socket to notify any subscribers.
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
   * Subscribes to realtime updates for a conversation.
   *
   * Establishes a WebSocket connection to receive instant updates when new
   * messages are added to the conversation. Returns an unsubscribe function
   * to clean up the connection.
   * 
   * <Note>
   * When receiving messages through this function, tool call data is truncated for efficiency. The `arguments_string` is limited to 500 characters and `results` to 50 characters. The complete tool call data is always saved in storage and can be retrieved by calling {@linkcode getConversation | getConversation()} after the message completes.
   * </Note>
   *
   * @param conversationId - The conversation ID to subscribe to.
   * @param onUpdate - Callback function called when the conversation is updated. The callback receives a conversation object with the following properties:
   * - `id`: Unique identifier for the conversation.
   * - `agent_name`: Name of the agent in this conversation.
   * - `created_date`: ISO 8601 timestamp of when the conversation was created.
   * - `updated_date`: ISO 8601 timestamp of when the conversation was last updated.
   * - `messages`: Array of messages in the conversation. Each message includes `id`, `role` (`'user'`, `'assistant'`, or `'system'`), `content`, `created_date`, and optionally `tool_calls`, `reasoning`, `file_urls`, and `usage`.
   * - `metadata`: Optional metadata associated with the conversation.
   * @returns Unsubscribe function to stop receiving updates.
   *
   * @example
   * ```typescript
   * // Subscribe to realtime updates
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
   * Creates a code-defined agent: you specify the model, system prompt, and tools in code,
   * and the SDK runs the tool-calling loop against the Base44 AI Gateway.
   *
   * Returns a reusable {@linkcode Agent} you can {@linkcode Agent.run | run} or expose to
   * another agent as a tool with {@linkcode Agent.asTool | asTool}.
   *
   * @param config - Model alias, optional system prompt, tools, and step limit.
   * @returns A reusable {@linkcode Agent} with {@linkcode Agent.run | run()} and {@linkcode Agent.asTool | asTool()}.
   *
   * @example
   * ```typescript
   * const agent = base44.agents.create({
   *   model: "claude_sonnet_4_6",
   *   system: "You plan trips.",
   *   tools: { getWeather },
   * });
   * const { text } = await agent.run({ prompt: "Plan a day in Haifa." });
   * ```
   */
  create(config: AgentConfig): Agent;

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
  getWhatsAppConnectURL(agentName: AgentName): string;

  /**
   * Gets Telegram connection URL for an agent.
   *
   * Generates a URL that users can use to connect with the agent through Telegram.
   * The URL includes authentication if a token is available. When the user opens
   * this URL, they are redirected to the agent's Telegram bot with an activation
   * code that securely links their account.
   *
   * @param agentName - The name of the agent.
   * @returns Telegram connection URL.
   *
   * @example
   * ```typescript
   * // Get Telegram connection URL
   * const telegramUrl = base44.agents.getTelegramConnectURL('support-agent');
   * console.log(`Connect through Telegram: ${telegramUrl}`);
   * // User can open this URL to start a Telegram conversation
   * ```
   */
  getTelegramConnectURL(agentName: AgentName): string;
}
