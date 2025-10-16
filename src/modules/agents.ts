import { RoomsSocket } from "../utils/socket-utils.js";
import { AgentConversation, AgentMessage } from "./agents.types.js";
import { AxiosInstance } from "axios";
import { ModelFilterParams } from "../types.js";
import { getAccessToken } from "../utils/auth-utils.js";

export type AgentsModuleConfig = {
  axios: AxiosInstance;
  socket: ReturnType<typeof RoomsSocket>;
  appId: string;
  serverUrl?: string;
  token?: string;
};

export function createAgentsModule({
  axios,
  socket,
  appId,
  serverUrl,
  token,
}: AgentsModuleConfig) {
  const baseURL = `/apps/${appId}/agents`;

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

  const createConversation = (conversation: {
    agent_name: string;
    metadata?: Record<string, any>;
  }) => {
    return axios.post<any, AgentConversation>(
      `${baseURL}/conversations`,
      conversation
    );
  };
 
  const addMessage = async (
    conversation: AgentConversation,
    message: AgentMessage
  ) => {
    const room = `/agent-conversations/${conversation.id}`;
    await socket.updateModel(
      room,
      {
        ...conversation,
        messages: [...(conversation.messages || []), message],
      }
    );
    return axios.post<any, AgentMessage>(
      `${baseURL}/conversations/${conversation.id}/messages`,
      message
    );
  };

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

  const getWhatsAppConnectURL = (agentName: string) => {
    const baseUrl = `${serverUrl}/api/apps/${appId}/agents/${encodeURIComponent(agentName)}/whatsapp`;
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
