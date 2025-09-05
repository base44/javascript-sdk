import {
  createClient,
  AgentConversation,
  Message,
  CreateConversationPayload,
  AgentsModuleConfig,
} from "@base44/sdk";

// TypeScript example with full type safety
interface CustomerContext {
  customerId: string;
  tier: "basic" | "premium" | "enterprise";
  previousInteractions: number;
}

interface ConversationMetadata {
  source: "web" | "mobile" | "api";
  priority: "low" | "normal" | "high" | "urgent";
  department: string;
  customerContext?: CustomerContext;
}

class AgentChatManager {
  private client: ReturnType<typeof createClient>;
  private activeConversations: Map<string, AgentConversation> = new Map();
  private subscriptions: Map<string, () => void> = new Map();

  constructor(appId: string, token: string, agentsConfig?: AgentsModuleConfig) {
    this.client = createClient({
      appId,
      token,
      agents: {
        enableWebSocket: true,
        ...agentsConfig,
      },
    });
  }

  /**
   * Create a new conversation with typed metadata
   */
  async createTypedConversation(
    agentName: string,
    metadata: ConversationMetadata
  ): Promise<AgentConversation> {
    const payload: CreateConversationPayload = {
      agent_name: agentName,
      metadata: metadata as Record<string, any>,
    };

    const conversation = await this.client.agents.createConversation(payload);
    this.activeConversations.set(conversation.id, conversation);
    return conversation;
  }

  /**
   * Send a typed message to an agent
   */
  async sendTypedMessage(
    conversationId: string,
    content: string,
    metadata?: Record<string, any>
  ): Promise<Message> {
    const message: Omit<Message, "id"> = {
      role: "user",
      content,
      timestamp: new Date().toISOString(),
      metadata: {
        ...metadata,
        client_version: "1.0.0",
        user_agent:
          typeof window !== "undefined" ? navigator.userAgent : "server",
      },
    };

    return await this.client.agents.sendMessage(conversationId, message);
  }

  /**
   * Subscribe to conversation updates with typed callbacks
   */
  subscribeToConversation(
    conversationId: string,
    onUpdate: (conversation: AgentConversation) => void,
    onError?: (error: Error) => void
  ): void {
    try {
      const unsubscribe = this.client.agents.subscribeToConversation(
        conversationId,
        (conversation) => {
          // Update local cache
          this.activeConversations.set(conversationId, conversation);
          onUpdate(conversation);
        }
      );

      this.subscriptions.set(conversationId, unsubscribe);
    } catch (error) {
      if (onError) {
        onError(error as Error);
      } else {
        console.error("Subscription error:", error);
      }
    }
  }

  /**
   * Get conversation with type safety
   */
  async getConversationSafely(
    conversationId: string
  ): Promise<AgentConversation | null> {
    try {
      return await this.client.agents.getConversation(conversationId);
    } catch (error) {
      console.error(`Failed to get conversation ${conversationId}:`, error);
      return null;
    }
  }

  /**
   * List conversations with filtering
   */
  async listConversationsByAgent(
    agentName: string,
    limit: number = 50
  ): Promise<AgentConversation[]> {
    return await this.client.agents.listConversations({
      query: { agent_name: agentName },
      limit,
      sort: { created_at: -1 },
    });
  }

  /**
   * Clean up all subscriptions
   */
  cleanup(): void {
    this.subscriptions.forEach((unsubscribe) => unsubscribe());
    this.subscriptions.clear();
    this.activeConversations.clear();
    this.client.agents.disconnectWebSocket();
  }

  /**
   * Get active conversation count
   */
  getActiveConversationCount(): number {
    return this.activeConversations.size;
  }

  /**
   * Get WebSocket status
   */
  getConnectionStatus(): { enabled: boolean; connected: boolean } {
    return this.client.agents.getWebSocketStatus();
  }
}

// Usage examples with the typed manager
async function typedUsageExample() {
  const chatManager = new AgentChatManager("your-app-id", "your-token");

  try {
    // Create a conversation with typed metadata
    const conversation = await chatManager.createTypedConversation(
      "customer-support-agent",
      {
        source: "web",
        priority: "normal",
        department: "support",
        customerContext: {
          customerId: "cust_12345",
          tier: "premium",
          previousInteractions: 3,
        },
      }
    );

    console.log("Created conversation:", conversation.id);

    // Subscribe to updates
    chatManager.subscribeToConversation(
      conversation.id,
      (updatedConversation) => {
        console.log(`Conversation ${updatedConversation.id} updated:`, {
          messageCount: updatedConversation.messages.length,
          lastMessage:
            updatedConversation.messages[
              updatedConversation.messages.length - 1
            ]?.content,
        });
      },
      (error) => {
        console.error("Subscription error:", error);
      }
    );

    // Send messages with metadata
    await chatManager.sendTypedMessage(
      conversation.id,
      "Hello! I need help with my premium account.",
      {
        intent: "account_help",
        category: "billing",
      }
    );

    // List conversations by agent
    const supportConversations = await chatManager.listConversationsByAgent(
      "customer-support-agent",
      10
    );

    console.log(`Found ${supportConversations.length} support conversations`);

    // Clean up after 30 seconds
    setTimeout(() => {
      chatManager.cleanup();
      console.log("Chat manager cleaned up");
    }, 30000);
  } catch (error) {
    console.error("Typed usage error:", error);
    chatManager.cleanup();
  }
}

// Multi-agent conversation example
interface AgentConfig {
  name: string;
  department: string;
  specialties: string[];
}

class MultiAgentManager {
  private chatManager: AgentChatManager;
  private agents: AgentConfig[] = [
    {
      name: "sales-agent",
      department: "sales",
      specialties: ["pricing", "plans", "demos"],
    },
    {
      name: "support-agent",
      department: "support",
      specialties: ["technical-issues", "account-help", "billing"],
    },
    {
      name: "technical-agent",
      department: "engineering",
      specialties: ["api-integration", "troubleshooting", "development"],
    },
  ];

  constructor(appId: string, token: string) {
    this.chatManager = new AgentChatManager(appId, token);
  }

  /**
   * Route user query to appropriate agent based on intent
   */
  async routeToAgent(
    userQuery: string,
    customerContext: CustomerContext
  ): Promise<AgentConversation> {
    const intent = this.detectIntent(userQuery);
    const agent = this.selectAgent(intent);

    const conversation = await this.chatManager.createTypedConversation(
      agent.name,
      {
        source: "web",
        priority: this.determinePriority(customerContext),
        department: agent.department,
        customerContext,
      }
    );

    // Send initial message
    await this.chatManager.sendTypedMessage(conversation.id, userQuery, {
      intent,
      routing_agent: agent.name,
      routing_reason: `Selected based on specialties: ${agent.specialties.join(
        ", "
      )}`,
    });

    return conversation;
  }

  private detectIntent(query: string): string {
    const lowerQuery = query.toLowerCase();

    if (
      lowerQuery.includes("price") ||
      lowerQuery.includes("plan") ||
      lowerQuery.includes("buy")
    ) {
      return "sales_inquiry";
    }
    if (
      lowerQuery.includes("api") ||
      lowerQuery.includes("integration") ||
      lowerQuery.includes("code")
    ) {
      return "technical_support";
    }
    if (
      lowerQuery.includes("problem") ||
      lowerQuery.includes("issue") ||
      lowerQuery.includes("help")
    ) {
      return "general_support";
    }

    return "general_inquiry";
  }

  private selectAgent(intent: string): AgentConfig {
    switch (intent) {
      case "sales_inquiry":
        return this.agents.find((a) => a.name === "sales-agent")!;
      case "technical_support":
        return this.agents.find((a) => a.name === "technical-agent")!;
      default:
        return this.agents.find((a) => a.name === "support-agent")!;
    }
  }

  private determinePriority(
    context: CustomerContext
  ): "low" | "normal" | "high" | "urgent" {
    if (context.tier === "enterprise") return "high";
    if (context.tier === "premium") return "normal";
    return "low";
  }

  cleanup(): void {
    this.chatManager.cleanup();
  }
}

// Example usage of multi-agent system
async function multiAgentExample() {
  const multiAgent = new MultiAgentManager("your-app-id", "your-token");

  const customerContext: CustomerContext = {
    customerId: "cust_67890",
    tier: "enterprise",
    previousInteractions: 5,
  };

  try {
    // Route different queries to different agents
    const queries = [
      "I want to upgrade to your enterprise plan",
      "I'm having trouble with the API integration",
      "My account dashboard is not loading properly",
    ];

    const conversations = await Promise.all(
      queries.map((query) => multiAgent.routeToAgent(query, customerContext))
    );

    console.log(
      "Created conversations:",
      conversations.map((c) => ({
        id: c.id,
        agent: c.agent_name,
        department: (c.metadata as ConversationMetadata).department,
      }))
    );

    // Clean up after processing
    setTimeout(() => {
      multiAgent.cleanup();
    }, 30000);
  } catch (error) {
    console.error("Multi-agent example error:", error);
    multiAgent.cleanup();
  }
}

// Export for use in other modules
export {
  AgentChatManager,
  MultiAgentManager,
  typedUsageExample,
  multiAgentExample,
  type CustomerContext,
  type ConversationMetadata,
};

// Run examples if this file is executed directly
if (
  typeof window === "undefined" &&
  import.meta.url === `file://${process.argv[1]}`
) {
  console.log("Running TypeScript Agents Examples...");

  typedUsageExample().then(() => {
    console.log("Typed usage example completed");
  });

  setTimeout(() => {
    multiAgentExample().then(() => {
      console.log("Multi-agent example completed");
    });
  }, 5000);
}
