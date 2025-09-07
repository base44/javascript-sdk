import { RoomsSocket, RoomsSocketConfig } from "../utils/socket-utils";
import { createAxiosClient } from "../utils/axios-client";
import { AgentConversation, AgentMessage } from "./agents.types";

export type AgentsModuleConfig = {
  serverUrl: string;
  appId: string;
  token?: string;
};

export function createAgentsModule({
  appId,
  serverUrl,
  token,
}: AgentsModuleConfig) {
  let currentConversation: any = null;
  const socketConfig: RoomsSocketConfig = {
    serverUrl,
    mountPath: "/ws-user-apps/socket.io/",
    transports: ["websocket"],
    query: {
      appId,
      token,
    },
  };

  const axiosConfig: AgentsModuleConfig = {
    serverUrl,
    appId,
    token,
  };

  let axios = createAgentsAxiosClient({
    serverUrl,
    appId,
    token,
  });

  const roomSocket = RoomsSocket({
    config: socketConfig,
  });

  const updateConfig = (config: Partial<AgentsModuleConfig>) => {
    axios = createAgentsAxiosClient({ ...axiosConfig, ...config });
    roomSocket.updateConfig({ ...socketConfig, ...config });
  };

  const getConversations = () => {
    return axios.get<any, AgentConversation[]>(`/conversations`);
  };

  const getConversation = (conversationId: string) => {
    return axios.get<any, AgentConversation | undefined>(
      `/conversations/${conversationId}`
    );
  };

  const listConversations = (filterParams: any) => {
    return axios.get<any, AgentConversation[]>(`/conversations`, {
      params: filterParams,
    });
  };

  const createConversation = (conversation: any) => {
    return axios.post<any, AgentConversation>(`/conversations`, conversation);
  };

  const addMessage = (conversation: any, message: any) => {
    // this whole trick with current conversation so that we can call the onUpdateModel with the latest messages
    let convLatestMessages = null;
    if (currentConversation && currentConversation.id === conversation.id) {
      convLatestMessages = currentConversation.messages;
    } else {
      currentConversation = conversation;
      convLatestMessages = conversation.messages;
    }
    conversation.messages = [...convLatestMessages, message];
    roomSocket.handlers.update_model({
      room: `/agent-conversations/${conversation.id}`,
      data: JSON.stringify(conversation),
    });
    return axios.post<any, AgentMessage>(
      `/conversations/${conversation.id}/messages`,
      message
    );
  };

  const subscribeToConversation = (conversationId: string, onUpdate: any) => {
    return roomSocket.subscribeToRoom(
      `/agent-conversations/${conversationId}`,
      {
        connect: () => {},
        update_model: ({ data: jsonStr }) => {
          const data = JSON.parse(jsonStr) as {} & { id: string };
          if (currentConversation && currentConversation.id === data.id) {
            currentConversation = data;
          }
          onUpdate(data);
        },
      }
    );
  };

  return {
    getConversations,
    getConversation,
    listConversations,
    createConversation,
    addMessage,
    subscribeToConversation,
    updateConfig,
  };
}

function createAgentsAxiosClient({
  serverUrl,
  appId,
  token,
}: AgentsModuleConfig) {
  const axios = createAxiosClient({
    baseURL: `${serverUrl}/api/apps/${appId}/agents`,
    appId,
    serverUrl,
    token,
    interceptResponses: true,
    headers: {
      "X-App-Id": String(appId),
    },
  });

  return axios;
}
