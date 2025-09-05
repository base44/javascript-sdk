import { AxiosInstance } from "axios";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
  metadata?: Record<string, any>;
}

export interface AgentConversation {
  id: string;
  app_id: string;
  created_by_id: string;
  agent_name: string;
  messages: Message[];
  metadata: Record<string, any>;
  created_at?: string;
  updated_at?: string;
}

export interface CreateConversationPayload {
  agent_name: string;
  metadata?: Record<string, any>;
}

export interface UpdateConversationPayload {
  metadata?: Record<string, any>;
}

export interface FilterParams {
  query?: Record<string, any>;
  sort?: Record<string, 1 | -1>;
  limit?: number;
  skip?: number;
}

export interface AgentsModuleConfig {
  enableWebSocket?: boolean;
  socketUrl?: string;
}

/**
 * WebSocket manager for real-time agent conversations
 */
class AgentWebSocketManager {
  private socket: WebSocket | null = null;
  private listeners: Map<string, Set<(data: any) => void>> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private socketUrl: string;
  private appId: string;
  private token?: string;

  constructor(socketUrl: string, appId: string, token?: string) {
    this.socketUrl = socketUrl;
    this.appId = appId;
    this.token = token;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Check if WebSocket is available (browser environment)
      if (typeof WebSocket === "undefined") {
        reject(new Error("WebSocket is not available in this environment"));
        return;
      }

      if (this.socket?.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      try {
        const wsUrl = new URL(this.socketUrl);
        wsUrl.searchParams.set("appId", this.appId);
        if (this.token) {
          wsUrl.searchParams.set("token", this.token);
        }

        this.socket = new WebSocket(wsUrl.toString());

        this.socket.onopen = () => {
          this.reconnectAttempts = 0;
          resolve();
        };

        this.socket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            this.handleMessage(data);
          } catch (error) {
            console.error("Failed to parse WebSocket message:", error);
          }
        };

        this.socket.onclose = () => {
          this.attemptReconnect();
        };

        this.socket.onerror = (error) => {
          console.error("WebSocket error:", error);
          reject(error);
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  private handleMessage(data: any) {
    if (data.event === "update_model" && data.data?.room) {
      const listeners = this.listeners.get(data.data.room);
      if (listeners) {
        const parsedData =
          typeof data.data.data === "string"
            ? JSON.parse(data.data.data)
            : data.data.data;
        listeners.forEach((callback) => callback(parsedData));
      }
    }
  }

  private attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error("Max reconnection attempts reached");
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    setTimeout(() => {
      console.log(
        `Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`
      );
      this.connect().catch((error) => {
        console.error("Reconnection failed:", error);
      });
    }, delay);
  }

  subscribe(
    room: string,
    callback: (data: AgentConversation) => void
  ): () => void {
    if (!this.listeners.has(room)) {
      this.listeners.set(room, new Set());
    }
    this.listeners.get(room)!.add(callback);

    // Send subscription message if connected
    if (
      typeof WebSocket !== "undefined" &&
      this.socket &&
      this.socket.readyState === WebSocket.OPEN &&
      this.socket.send
    ) {
      this.socket.send(
        JSON.stringify({
          type: "subscribe",
          room: room,
        })
      );
    }

    // Return unsubscribe function
    return () => {
      const roomListeners = this.listeners.get(room);
      if (roomListeners) {
        roomListeners.delete(callback);
        if (roomListeners.size === 0) {
          this.listeners.delete(room);
          // Send unsubscribe message if connected
          if (
            typeof WebSocket !== "undefined" &&
            this.socket &&
            this.socket.readyState === WebSocket.OPEN &&
            this.socket.send
          ) {
            this.socket.send(
              JSON.stringify({
                type: "unsubscribe",
                room: room,
              })
            );
          }
        }
      }
    };
  }

  disconnect() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.listeners.clear();
  }

  isConnected(): boolean {
    if (typeof WebSocket === "undefined") {
      return false;
    }
    return this.socket?.readyState === WebSocket.OPEN;
  }
}

/**
 * Create agents module for managing AI agent conversations
 */
export function createAgentsModule(
  axiosClient: AxiosInstance,
  appId: string,
  config: AgentsModuleConfig = {}
) {
  let webSocketManager: AgentWebSocketManager | null = null;
  let currentConversation: AgentConversation | null = null;

  // Initialize WebSocket if enabled
  if (config.enableWebSocket) {
    const socketUrl = config.socketUrl || "wss://base44.app/ws";
    // Extract token from axios client if available
    const token =
      axiosClient.defaults.headers.common?.Authorization?.toString().replace(
        "Bearer ",
        ""
      );
    webSocketManager = new AgentWebSocketManager(socketUrl, appId, token);
  }

  return {
    /**
     * List all conversations for the current user
     */
    async listConversations(
      filterParams?: FilterParams
    ): Promise<AgentConversation[]> {
      const response = await axiosClient.get(
        `/apps/${appId}/agents/conversations`,
        {
          params: filterParams,
        }
      );
      return response as unknown as AgentConversation[];
    },

    /**
     * Get a specific conversation by ID
     */
    async getConversation(conversationId: string): Promise<AgentConversation> {
      const response = await axiosClient.get(
        `/apps/${appId}/agents/conversations/${conversationId}`
      );
      return response as unknown as AgentConversation;
    },

    /**
     * Create a new agent conversation
     */
    async createConversation(
      payload: CreateConversationPayload
    ): Promise<AgentConversation> {
      const response = await axiosClient.post(
        `/apps/${appId}/agents/conversations`,
        payload
      );
      return response as unknown as AgentConversation;
    },

    /**
     * Update conversation metadata
     */
    async updateConversation(
      conversationId: string,
      payload: UpdateConversationPayload
    ): Promise<AgentConversation> {
      const response = await axiosClient.put(
        `/apps/${appId}/agents/conversations/${conversationId}`,
        payload
      );
      return response as unknown as AgentConversation;
    },

    /**
     * Send a message to an agent and get response
     */
    async sendMessage(
      conversationId: string,
      message: Omit<Message, "id">
    ): Promise<Message> {
      // Update current conversation for WebSocket tracking
      if (currentConversation?.id === conversationId) {
        currentConversation.messages = [
          ...currentConversation.messages,
          { ...message, id: "temp-" + Date.now() },
        ];
      }

      const response = await axiosClient.post(
        `/apps/${appId}/agents/conversations/${conversationId}/messages`,
        message
      );
      return response as unknown as Message;
    },

    /**
     * Delete a message from a conversation
     */
    async deleteMessage(
      conversationId: string,
      messageId: string
    ): Promise<void> {
      await axiosClient.delete(
        `/apps/${appId}/agents/conversations/${conversationId}/messages/${messageId}`
      );
    },

    /**
     * Subscribe to real-time updates for a conversation
     * Requires WebSocket to be enabled in config
     */
    subscribeToConversation(
      conversationId: string,
      onUpdate: (conversation: AgentConversation) => void
    ): () => void {
      if (!webSocketManager) {
        throw new Error(
          "WebSocket is not enabled. Set enableWebSocket: true in agents config"
        );
      }

      // Connect WebSocket if not already connected
      if (!webSocketManager.isConnected()) {
        webSocketManager.connect().catch((error) => {
          console.error("Failed to connect WebSocket:", error);
        });
      }

      return webSocketManager.subscribe(
        `/agent-conversations/${conversationId}`,
        (data) => {
          // Update current conversation reference
          if (data.id === conversationId) {
            currentConversation = data;
          }
          onUpdate(data);
        }
      );
    },

    /**
     * Get WebSocket connection status
     */
    getWebSocketStatus(): { enabled: boolean; connected: boolean } {
      return {
        enabled: !!webSocketManager,
        connected: webSocketManager?.isConnected() || false,
      };
    },

    /**
     * Manually connect WebSocket
     */
    async connectWebSocket(): Promise<void> {
      if (!webSocketManager) {
        throw new Error(
          "WebSocket is not enabled. Set enableWebSocket: true in agents config"
        );
      }
      await webSocketManager.connect();
    },

    /**
     * Disconnect WebSocket
     */
    disconnectWebSocket(): void {
      if (webSocketManager) {
        webSocketManager.disconnect();
      }
    },
  };
}

export type AgentsModule = ReturnType<typeof createAgentsModule>;
