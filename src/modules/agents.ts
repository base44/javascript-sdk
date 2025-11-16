import { getAccessToken } from "../utils/auth-utils.js";
import { ModelFilterParams } from "../types.js";
import {
  AgentConversation,
  AgentMessage,
  AgentsModule,
  AgentsModuleConfig,
} from "./agents.types.js";

/**
 * Creates the agents module for the Base44 SDK.
 *
 * @param config - Configuration object containing axios, socket, appId, etc.
 * @returns Agents module with methods to manage AI agent conversations
 * @internal
 */
export function createAgentsModule({
  axios,
  socket,
  appId,
  serverUrl,
  token,
}: AgentsModuleConfig): AgentsModule {
  const baseURL = `/apps/${appId}/agents`;

  // Get all conversations for the current user
  const getConversations = () => {
    return axios.get<any, AgentConversation[]>(`${baseURL}/conversations`);
  };

  // Get a specific conversation by ID
  const getConversation = (conversationId: string) => {
    return axios.get<any, AgentConversation | undefined>(
      `${baseURL}/conversations/${conversationId}`
    );
  };

  // List conversations with filtering and pagination
  const listConversations = (filterParams: ModelFilterParams) => {
    return axios.get<any, AgentConversation[]>(`${baseURL}/conversations`, {
      params: filterParams,
    });
  };

  // Create a new conversation with an agent
  const createConversation = (conversation: {
    agent_name: string;
    metadata?: Record<string, any>;
  }) => {
    return axios.post<any, AgentConversation>(
      `${baseURL}/conversations`,
      conversation
    );
  };

  // Add a message to a conversation
  const addMessage = async (
    conversation: AgentConversation,
    message: AgentMessage
  ) => {
    const room = `/agent-conversations/${conversation.id}`;
    await socket.updateModel(room, {
      ...conversation,
      messages: [...(conversation.messages || []), message],
    });
    return axios.post<any, AgentMessage>(
      `${baseURL}/conversations/${conversation.id}/messages`,
      message
    );
  };

  // Subscribe to real-time updates for a conversation
  const subscribeToConversation = (
    conversationId: string,
    onUpdate?: (conversation: AgentConversation) => void
  ) => {
    const room = `/agent-conversations/${conversationId}`;
    return socket.subscribeToRoom(room, {
      connect: () => {},
      update_model: ({ data: jsonStr }) => {
        const conv = JSON.parse(jsonStr) as AgentConversation;
        onUpdate?.(conv);
      },
    });
  };

  // Get WhatsApp connection URL for an agent
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

  return {
    getConversations,
    getConversation,
    listConversations,
    createConversation,
    addMessage,
    subscribeToConversation,
    getWhatsAppConnectURL,
  };
}
