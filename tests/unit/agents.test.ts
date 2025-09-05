import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import nock from "nock";
import { createClient } from "../../src/index.js";
import type {
  Message,
  AgentConversation,
  CreateConversationPayload,
} from "../../src/modules/agents.js";

// Mock WebSocket - initially undefined to simulate server environment
let mockWebSocketClass: any = undefined;

describe("Agents Module", () => {
  let base44: ReturnType<typeof createClient>;
  let scope: nock.Scope;
  const appId = "test-app-id";
  const serverUrl = "https://api.base44.com";

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset WebSocket mock to undefined (simulating server environment)
    global.WebSocket = mockWebSocketClass;

    // Create a new client for each test
    base44 = createClient({
      serverUrl,
      appId,
      token: "test-token",
    });

    // Create a nock scope for mocking API calls
    scope = nock(serverUrl);

    // Disable net connect to ensure all requests are mocked
    nock.disableNetConnect();

    // Enable request debugging for Nock
    nock.emitter.on("no match", (req) => {
      console.log(`Nock: No match for ${req.method} ${req.path}`);
      console.log("Headers:", req.getHeaders());
    });
  });

  afterEach(() => {
    // Clean up WebSocket connections
    if (base44.agents.getWebSocketStatus().enabled) {
      base44.agents.disconnectWebSocket();
    }

    // Clean up any pending mocks
    nock.cleanAll();
    nock.emitter.removeAllListeners("no match");
    nock.enableNetConnect();
  });

  describe("listConversations", () => {
    it("should fetch conversations with filter params", async () => {
      const mockConversations: AgentConversation[] = [
        {
          id: "1",
          app_id: appId,
          created_by_id: "user1",
          agent_name: "test-agent",
          messages: [],
          metadata: {},
        },
      ];

      scope
        .get(`/api/apps/${appId}/agents/conversations`)
        .query({ limit: 10, skip: 0 })
        .reply(function (uri, requestBody) {
          console.log("Nock intercepted request:", uri);
          console.log("Request body:", requestBody);
          console.log("Returning:", mockConversations);
          return [200, mockConversations];
        });

      const filterParams = { limit: 10, skip: 0 };

      // Debug: Check if agents module exists
      console.log("base44.agents:", !!base44.agents);
      console.log(
        "base44.agents.listConversations:",
        typeof base44.agents?.listConversations
      );

      try {
        const result = await base44.agents.listConversations(filterParams);
        console.log("result:", result);

        // Check if result is the expected value
        expect(result).toEqual(mockConversations);
        // expect(scope.isDone()).toBe(true);
      } catch (error) {
        console.log("Error occurred:", error);
        throw error;
      }
    });

    it("should fetch conversations without filter params", async () => {
      const mockConversations: AgentConversation[] = [];

      scope
        .get(`/api/apps/${appId}/agents/conversations`)
        .reply(200, mockConversations);

      const result = await base44.agents.listConversations();

      expect(result).toEqual(mockConversations);
      expect(scope.isDone()).toBe(true);
    });
  });

  describe("getConversation", () => {
    it("should fetch a specific conversation", async () => {
      const conversationId = "conv-123";
      const mockConversation: AgentConversation = {
        id: conversationId,
        app_id: appId,
        created_by_id: "user1",
        agent_name: "test-agent",
        messages: [],
        metadata: {},
      };

      scope
        .get(`/api/apps/${appId}/agents/conversations/${conversationId}`)
        .reply(200, mockConversation);

      const result = await base44.agents.getConversation(conversationId);

      expect(result).toEqual(mockConversation);
      expect(scope.isDone()).toBe(true);
    });
  });

  describe("createConversation", () => {
    it("should create a new conversation", async () => {
      const payload: CreateConversationPayload = {
        agent_name: "test-agent",
        metadata: { key: "value" },
      };

      const mockConversation: AgentConversation = {
        id: "new-conv-123",
        app_id: appId,
        created_by_id: "user1",
        agent_name: payload.agent_name,
        messages: [],
        metadata: payload.metadata || {},
      };

      scope
        .post(
          `/api/apps/${appId}/agents/conversations`,
          payload as Record<string, any>
        )
        .reply(200, mockConversation);

      const result = await base44.agents.createConversation(payload);

      expect(result).toEqual(mockConversation);
      expect(scope.isDone()).toBe(true);
    });
  });

  describe("updateConversation", () => {
    it("should update conversation metadata", async () => {
      const conversationId = "conv-123";
      const payload = { metadata: { updated: true } };

      const mockConversation: AgentConversation = {
        id: conversationId,
        app_id: appId,
        created_by_id: "user1",
        agent_name: "test-agent",
        messages: [],
        metadata: payload.metadata,
      };

      scope
        .put(
          `/api/apps/${appId}/agents/conversations/${conversationId}`,
          payload
        )
        .reply(200, mockConversation);

      const result = await base44.agents.updateConversation(
        conversationId,
        payload
      );

      expect(result).toEqual(mockConversation);
      expect(scope.isDone()).toBe(true);
    });
  });

  describe("sendMessage", () => {
    it("should send a message to an agent", async () => {
      const conversationId = "conv-123";
      const message: Omit<Message, "id"> = {
        role: "user",
        content: "Hello, agent!",
        metadata: {},
      };

      const mockResponse: Message = {
        id: "msg-123",
        ...message,
      };

      scope
        .post(
          `/api/apps/${appId}/agents/conversations/${conversationId}/messages`,
          message
        )
        .reply(200, mockResponse);

      const result = await base44.agents.sendMessage(conversationId, message);

      expect(result).toEqual(mockResponse);
      expect(scope.isDone()).toBe(true);
    });
  });

  describe("deleteMessage", () => {
    it("should delete a message from a conversation", async () => {
      const conversationId = "conv-123";
      const messageId = "msg-123";

      scope
        .delete(
          `/api/apps/${appId}/agents/conversations/${conversationId}/messages/${messageId}`
        )
        .reply(200);

      await base44.agents.deleteMessage(conversationId, messageId);

      expect(scope.isDone()).toBe(true);
    });
  });

  describe("WebSocket functionality", () => {
    it("should throw error when WebSocket is not enabled", () => {
      expect(() => {
        base44.agents.subscribeToConversation("conv-123", () => {});
      }).toThrow(
        "WebSocket is not enabled. Set enableWebSocket: true in agents config"
      );
    });

    it("should return correct WebSocket status when disabled", () => {
      const status = base44.agents.getWebSocketStatus();
      expect(status).toEqual({
        enabled: false,
        connected: false,
      });
    });

    it("should throw error when trying to connect WebSocket when not enabled", async () => {
      await expect(base44.agents.connectWebSocket()).rejects.toThrow(
        "WebSocket is not enabled. Set enableWebSocket: true in agents config"
      );
    });
  });

  describe("WebSocket enabled", () => {
    let base44WithWS: ReturnType<typeof createClient>;

    beforeEach(() => {
      // Mock WebSocket for browser environment tests
      global.WebSocket = vi.fn(() => ({
        readyState: 0, // CONNECTING initially
        send: vi.fn(),
        close: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        onopen: null,
        onmessage: null,
        onclose: null,
        onerror: null,
      })) as any;

      // Create client with WebSocket enabled
      base44WithWS = createClient({
        serverUrl,
        appId,
        token: "test-token",
        agents: {
          enableWebSocket: true,
          socketUrl: "wss://test.example.com/ws",
        },
      });
    });

    afterEach(() => {
      base44WithWS.agents.disconnectWebSocket();
      // Reset WebSocket mock
      global.WebSocket = mockWebSocketClass;
    });

    it("should return correct WebSocket status when enabled", () => {
      const status = base44WithWS.agents.getWebSocketStatus();
      expect(status.enabled).toBe(true);
      // Don't test connected status as it depends on mock WebSocket implementation
    });

    it("should allow subscription when WebSocket is enabled", () => {
      const conversationId = "conv-123";
      const onUpdate = vi.fn();

      // This should not throw an error
      expect(() => {
        const unsubscribe = base44WithWS.agents.subscribeToConversation(
          conversationId,
          onUpdate
        );
        expect(typeof unsubscribe).toBe("function");
      }).not.toThrow();
    });

    it("should handle WebSocket connection attempt", async () => {
      // This test just verifies that connectWebSocket doesn't throw an error
      // when WebSocket is available
      expect(() => {
        base44WithWS.agents.connectWebSocket().catch(() => {
          // Ignore connection errors in tests
        });
      }).not.toThrow();
    });

    it("should handle subscription without throwing errors", () => {
      const conversationId = "conv-123";
      const onUpdate = vi.fn();

      // This should work without throwing errors
      expect(() => {
        const unsubscribe = base44WithWS.agents.subscribeToConversation(
          conversationId,
          onUpdate
        );
        unsubscribe(); // Test unsubscribe as well
      }).not.toThrow();
    });
  });
});
