import { createAxiosClient } from "../utils/axios-client.js";
import { RoomsSocket } from "../utils/socket-utils.js";
import { ModelFilterParams } from "../types.js";
import { AgentConversation, AgentMessage } from "./agents.types.js";
import {
  CreateSuperagentConversationParams,
  SuperagentHandle,
  SuperagentModule,
  SuperagentModuleConfig,
} from "./superagent.types.js";

// A public superagent app always exposes its agent under this fixed name.
const SUPERAGENT_AGENT_NAME = "your_agent";

export function createSuperagentModule({
  serverUrl,
  headers,
  onError,
}: SuperagentModuleConfig): SuperagentModule {
  const handles: Record<string, SuperagentHandle> = {};
  const sockets: Record<string, RoomsSocket> = {};

  const createHandle = (appId: string): SuperagentHandle => {
    const baseURL = `/apps/${appId}/agents`;

    // Dedicated anonymous client for the superagent app: no Authorization
    // token, so the request interceptor attaches X-Base44-Anonymous-Id and
    // the backend serves the caller as an anonymous visitor of the sibling
    // superagent app.
    const axios = createAxiosClient({
      baseURL: `${serverUrl}/api`,
      headers: {
        ...headers,
        "X-App-Id": String(appId),
      },
      onError,
    });

    const getSocket = () => {
      if (!sockets[appId]) {
        sockets[appId] = RoomsSocket({
          config: {
            serverUrl,
            mountPath: "/ws-user-apps/socket.io/",
            transports: ["websocket"],
            appId,
            anonymous: true,
          },
        });
      }
      return sockets[appId];
    };

    // Track active conversations
    const currentConversations: Record<string, AgentConversation | undefined> =
      {};

    const createConversation = (
      params: CreateSuperagentConversationParams = {}
    ) => {
      return axios.post<any, AgentConversation>(`${baseURL}/conversations`, {
        agent_name: SUPERAGENT_AGENT_NAME,
        ...params,
      });
    };

    const listConversations = (filterParams: ModelFilterParams = {}) => {
      return axios.get<any, AgentConversation[]>(`${baseURL}/conversations`, {
        params: filterParams,
      });
    };

    const getConversation = (conversationId: string) => {
      return axios.get<any, AgentConversation | undefined>(
        `${baseURL}/conversations/${conversationId}`
      );
    };

    const addMessage = async (
      conversation: AgentConversation,
      message: Partial<AgentMessage>
    ) => {
      return axios.post<any, AgentMessage>(
        `${baseURL}/conversations/v2/${conversation.id}/messages`,
        message
      );
    };

    const subscribeToConversation = (
      conversationId: string,
      onUpdate?: (conversation: AgentConversation) => void
    ) => {
      const room = `/agent-conversations/${conversationId}`;
      const socket = getSocket();

      // Store the promise for initial conversation state
      const conversationPromise = getConversation(conversationId).then(
        (conv) => {
          currentConversations[conversationId] = conv;
          return conv;
        }
      );

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
              const existingIndex = messages.findIndex(
                (m) => m.id === message.id
              );

              const updatedMessages =
                existingIndex !== -1
                  ? messages.map((m, i) => (i === existingIndex ? message : m))
                  : [...messages, message];

              currentConversations[conversationId] = {
                ...currentConversation,
                messages: updatedMessages,
              };
              onUpdate?.(currentConversations[conversationId]!);
            }
          }
        },
      });
    };

    return {
      createConversation,
      listConversations,
      getConversation,
      addMessage,
      subscribeToConversation,
    };
  };

  const forApp = (appId: string) => {
    if (!handles[appId]) {
      handles[appId] = createHandle(appId);
    }
    return handles[appId];
  };

  const cleanup = () => {
    Object.values(sockets).forEach((socket) => socket.disconnect());
  };

  return {
    forApp,
    cleanup,
  };
}
