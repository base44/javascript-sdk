import { mockHttp } from "../mocks/http";
import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { createClient } from "../../src/index.ts";

describe("Agents Module", () => {
  let base44: ReturnType<typeof createClient>;
  const appId = "test-app-id";
  const serverUrl = "https://api.base44.com";

  beforeEach(() => {
    base44 = createClient({ serverUrl, appId });
  });

  afterEach(() => {
    base44.cleanup();
  });

  describe("getConversations", () => {
    test("should fetch all conversations", async () => {
      const mockConversations = [
        { id: "conv-1", agent_name: "support", messages: [] },
        { id: "conv-2", agent_name: "sales", messages: [] },
      ];
      mockHttp({
        method: "get",
        url: serverUrl + `/api/apps/${appId}/agents/conversations`,
        status: 200,
        response: mockConversations,
      });

      const result = await base44.agents.getConversations();
      expect(result).toEqual(mockConversations);
    });
  });

  describe("getConversation", () => {
    test("should fetch a specific conversation", async () => {
      const mockConversation = {
        id: "conv-1",
        agent_name: "support",
        messages: [],
      };
      mockHttp({
        method: "get",
        url: serverUrl + `/api/apps/${appId}/agents/conversations/conv-1`,
        status: 200,
        response: mockConversation,
      });

      const result = await base44.agents.getConversation("conv-1");
      expect(result).toEqual(mockConversation);
    });
  });

  describe("createConversation", () => {
    test("should create a conversation", async () => {
      const created = { id: "conv-new", agent_name: "support", messages: [] };
      mockHttp({
        method: "post",
        url: serverUrl + `/api/apps/${appId}/agents/conversations`,
        status: 200,
        body: { agent_name: "support" },
        response: created,
      });

      const result = await base44.agents.createConversation({
        agent_name: "support",
      });
      expect(result).toEqual(created);
    });
  });

  describe("addMessage", () => {
    test("should post to v2 endpoint", async () => {
      const conversation = {
        id: "conv-1",
        agent_name: "support",
        messages: [],
      } as any;
      const response = { id: "msg-1", role: "assistant", content: "Hello!" };
      mockHttp({
        method: "post",
        url:
          serverUrl +
          `/api/apps/${appId}/agents/conversations/v2/conv-1/messages`,
        status: 200,
        body: { role: "user", content: "Hi" },
        response: response,
      });

      const result = await base44.agents.addMessage(conversation, {
        role: "user",
        content: "Hi",
      });
      expect(result).toEqual(response);
    });
  });

  describe("getWhatsAppConnectURL", () => {
    test("should return URL without token when no auth", () => {
      const url = base44.agents.getWhatsAppConnectURL("support");
      expect(url).toBe(
        `${serverUrl}/api/apps/${appId}/agents/support/whatsapp`,
      );
    });

    test("should include token when authenticated", () => {
      const authed = createClient({ serverUrl, appId, token: "test-token" });
      const url = authed.agents.getWhatsAppConnectURL("support");
      expect(url).toBe(
        `${serverUrl}/api/apps/${appId}/agents/support/whatsapp?token=test-token`,
      );
      authed.cleanup();
    });

    test("should encode agent name", () => {
      const url = base44.agents.getWhatsAppConnectURL("my agent");
      expect(url).toBe(
        `${serverUrl}/api/apps/${appId}/agents/my%20agent/whatsapp`,
      );
    });
  });

  describe("getTelegramConnectURL", () => {
    test("should return URL without token when no auth", () => {
      const url = base44.agents.getTelegramConnectURL("support");
      expect(url).toBe(
        `${serverUrl}/api/apps/${appId}/agents/support/telegram`,
      );
    });

    test("should include token when authenticated", () => {
      const authed = createClient({ serverUrl, appId, token: "test-token" });
      const url = authed.agents.getTelegramConnectURL("support");
      expect(url).toBe(
        `${serverUrl}/api/apps/${appId}/agents/support/telegram?token=test-token`,
      );
      authed.cleanup();
    });

    test("should encode agent name", () => {
      const url = base44.agents.getTelegramConnectURL("my agent");
      expect(url).toBe(
        `${serverUrl}/api/apps/${appId}/agents/my%20agent/telegram`,
      );
    });
  });
});
