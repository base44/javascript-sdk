import { getAccessToken } from "../utils/auth-utils.js";
import { ModelFilterParams } from "../types.js";
import {
  AgentConversation,
  AgentMessage,
  AgentsModule,
  AgentsModuleConfig,
  ClientToolHandler,
  ClientToolResult,
  CreateConversationParams,
} from "./agents.types.js";

export function createAgentsModule({
  axios,
  getSocket,
  appId,
  serverUrl,
  token,
}: AgentsModuleConfig): AgentsModule {
  const baseURL = `/apps/${appId}/agents`;

  // Track active conversations
  const currentConversations: Record<string, AgentConversation | undefined> = {};

  // Stores client tool handlers keyed by conversation ID
  const clientToolHandlers: Record<string, Record<string, ClientToolHandler>> = {};

  const getConversations = () => {
    return axios.get<any, AgentConversation[]>(`${baseURL}/conversations`);
  };

  const getConversation = (conversationId: string) => {
    return axios.get<any, AgentConversation | undefined>(
      `${baseURL}/conversations/${conversationId}`
    );
  };

  const listConversations = (filterParams: ModelFilterParams) => {
    return axios.get<any, AgentConversation[]>(`${baseURL}/conversations`, {
      params: filterParams,
    });
  };

  const createConversation = (conversation: CreateConversationParams) => {
    return axios.post<any, AgentConversation>(
      `${baseURL}/conversations`,
      conversation
    );
  };

  const addMessage = async (
    conversation: AgentConversation,
    message: AgentMessage
  ) => {
    return axios.post<any, AgentMessage>(
      `${baseURL}/conversations/v2/${conversation.id}/messages`,
      message
    );
  };

  const registerClientToolHandlers = (
    conversationId: string,
    handlers: Record<string, ClientToolHandler>
  ) => {
    clientToolHandlers[conversationId] = {
      ...(clientToolHandlers[conversationId] || {}),
      ...handlers,
    };
  };

  const submitToolResults = (
    conversationId: string,
    results: ClientToolResult[]
  ) => {
    return axios.post(`${baseURL}/conversations/${conversationId}/client-tool-results`, { results });
  };

  const handlePendingClientTools = async (
    conversationId: string,
    message: AgentMessage
  ): Promise<boolean> => {
    if (!message?.tool_calls) return false;

    const pendingCalls = message.tool_calls.filter(
      (tc) => tc.status === "pending_client_execution"
    );

    if (pendingCalls.length === 0) return false;

    const handlers = clientToolHandlers[conversationId];
    if (!handlers) return false;

    const results: ClientToolResult[] = [];
    for (const tc of pendingCalls) {
      const handler = handlers[tc.name];
      if (!handler) {
        results.push({
          tool_call_id: tc.id,
          result: `Error: No handler registered for client tool '${tc.name}'`,
        });
        continue;
      }

      try {
        const args = JSON.parse(tc.arguments_string);
        const context = {
          appId,
          conversationId,
          toolCallId: tc.id,
          toolName: tc.name,
          messages: currentConversations[conversationId]?.messages || [],
        };
        const result = await handler(args, context);
        results.push({
          tool_call_id: tc.id,
          result: typeof result === "string" ? result : JSON.stringify(result),
        });
      } catch (error: any) {
        results.push({
          tool_call_id: tc.id,
          result: `Error executing client tool '${tc.name}': ${error.message}`,
        });
      }
    }

    await submitToolResults(conversationId, results);
    return true;
  };

  const subscribeToConversation = (
    conversationId: string,
    onUpdate?: (conversation: AgentConversation) => void
  ) => {
    const room = `/agent-conversations/${conversationId}`;
    const socket = getSocket();

    // Store the promise for initial conversation state
    const conversationPromise = getConversation(conversationId).then((conv) => {
      currentConversations[conversationId] = conv;
      return conv;
    });

    return socket.subscribeToRoom(room, {
      connect: () => {},
      update_model: async ({ data: jsonStr }) => {
        const data = JSON.parse(jsonStr);

        if (data._message) {
          // Wait for initial conversation to be loaded
          await conversationPromise;
          const message = data._message as AgentMessage;

          // Update shared conversation state
          const currentConversation = currentConversations[conversationId];
          if (currentConversation) {
            const messages = currentConversation.messages || [];
            const existingIndex = messages.findIndex((m) => m.id === message.id);

            const updatedMessages =
              existingIndex !== -1
                ? messages.map((m, i) => (i === existingIndex ? message : m))
                : [...messages, message];

            currentConversations[conversationId] = {
              ...currentConversation,
              messages: updatedMessages,
            };
            onUpdate?.(currentConversations[conversationId]!);

            // Automatically handle pending client tool calls
            await handlePendingClientTools(conversationId, message);
          }
        }
      },
    });
  };

  const getWhatsAppConnectURL = (agentName: string) => {
    const baseUrl = `${serverUrl}/api/apps/${appId}/agents/${encodeURIComponent(
      agentName
    )}/whatsapp`;
    const accessToken = token ?? getAccessToken();

    if (accessToken) {
      return `${baseUrl}?token=${accessToken}`;
    } else {
      // No token - URL will redirect to login automatically
      return baseUrl;
    }
  };

  const getTelegramConnectURL = (agentName: string) => {
    const baseUrl = `${serverUrl}/api/apps/${appId}/agents/${encodeURIComponent(
      agentName
    )}/telegram`;
    const accessToken = token ?? getAccessToken();

    if (accessToken) {
      return `${baseUrl}?token=${accessToken}`;
    } else {
      // No token - URL will redirect to login automatically
      return baseUrl;
    }
  };

  return {
    getConversations,
    getConversation,
    listConversations,
    createConversation,
    addMessage,
    registerClientToolHandlers,
    submitToolResults,
    handlePendingClientTools,
    subscribeToConversation,
    getWhatsAppConnectURL,
    getTelegramConnectURL,
  };
}
