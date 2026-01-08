import { getAccessToken } from "../utils/auth-utils.js";
import { ModelFilterParams } from "../types.js";
import {
  AgentConversation,
  AgentMessage,
  AgentsModule,
  AgentsModuleConfig,
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
      `${baseURL}/conversations/${conversation.id}/messages`,
      { ...message, api_version: "v2" }
    );
  };

  const subscribeToConversation = (
    conversationId: string,
    onUpdate?: (conversation: AgentConversation) => void
  ) => {
    const room = `/agent-conversations/${conversationId}`;
    const socket = getSocket();

    // Store the promise for initial conversation state
    let currentConversation: AgentConversation | undefined;
    const conversationPromise = getConversation(conversationId).then((conv) => {
      currentConversation = conv;
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

          // Update local conversation state
          if (currentConversation) {
            const messages = currentConversation.messages || [];
            const existingIndex = messages.findIndex((m) => m.id === message.id);

            const updatedMessages =
              existingIndex !== -1
                ? messages.map((m, i) => (i === existingIndex ? message : m))
                : [...messages, message];

            currentConversation = {
              ...currentConversation,
              messages: updatedMessages,
            };
            onUpdate?.(currentConversation);
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
