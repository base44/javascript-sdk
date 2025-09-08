import { RoomsSocket, RoomsSocketConfig } from "../utils/socket-utils.js";
import { createAxiosClient } from "../utils/axios-client.js";
import { AgentConversation, AgentMessage } from "./agents.types.js";
import { AxiosInstance } from "axios";

export type AgentsModuleConfig = {
  axios: AxiosInstance;
  socket: ReturnType<typeof RoomsSocket>;
  appId: string;
};

export function createAgentsModule({
  axios,
  socket,
  appId,
}: AgentsModuleConfig) {
  let currentConversation: any = null;
  const baseURL = `/apps/${appId}/agents`;

  const getConversations = () => {
    return axios.get<any, AgentConversation[]>(`${baseURL}/conversations`);
  };

  const getConversation = (conversationId: string) => {
    return axios.get<any, AgentConversation | undefined>(
      `${baseURL}/conversations/${conversationId}`
    );
  };

  const listConversations = (filterParams: any) => {
    return axios.get<any, AgentConversation[]>(`${baseURL}/conversations`, {
      params: filterParams,
    });
  };

  const createConversation = (conversation: any) => {
    return axios.post<any, AgentConversation>(
      `${baseURL}/conversations`,
      conversation
    );
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
    socket.handlers.update_model({
      room: `/agent-conversations/${conversation.id}`,
      data: JSON.stringify(conversation),
    });
    return axios.post<any, AgentMessage>(
      `${baseURL}/conversations/${conversation.id}/messages`,
      message
    );
  };

  const subscribeToConversation = (conversationId: string, onUpdate: any) => {
    return socket.subscribeToRoom(`/agent-conversations/${conversationId}`, {
      connect: () => {},
      update_model: ({ data: jsonStr }) => {
        const data = JSON.parse(jsonStr) as {} & { id: string };
        if (currentConversation && currentConversation.id === data.id) {
          currentConversation = data;
        }
        onUpdate(data);
      },
    });
  };

  return {
    getConversations,
    getConversation,
    listConversations,
    createConversation,
    addMessage,
    subscribeToConversation,
  };
}
