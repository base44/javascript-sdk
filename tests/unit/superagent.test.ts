import { describe, test, expect, beforeEach, afterEach } from "vitest";
import nock from "nock";
import { createClient } from "../../src/index.ts";

describe("Superagent Module", () => {
  let base44: ReturnType<typeof createClient>;
  let scope: nock.Scope;
  const hostAppId = "host-app-id";
  const superagentAppId = "superagent-app-id";
  const serverUrl = "https://api.base44.com";

  beforeEach(() => {
    base44 = createClient({ serverUrl, appId: hostAppId });
    scope = nock(serverUrl);
    nock.disableNetConnect();
  });

  afterEach(() => {
    nock.cleanAll();
    nock.enableNetConnect();
  });

  describe("forApp", () => {
    test("should return the same handle for the same app id", () => {
      const first = base44.superagent.forApp(superagentAppId);
      const second = base44.superagent.forApp(superagentAppId);
      expect(second).toBe(first);
    });

    test("should return distinct handles for distinct app ids", () => {
      const first = base44.superagent.forApp(superagentAppId);
      const other = base44.superagent.forApp("other-superagent-app-id");
      expect(other).not.toBe(first);
    });
  });

  describe("createConversation", () => {
    test("should post to the superagent app path with agent_name your_agent", async () => {
      const created = { id: "conv-new", agent_name: "your_agent", messages: [] };
      let capturedBody: any;
      scope
        .post(
          `/api/apps/${superagentAppId}/agents/conversations`,
          (body) => {
            capturedBody = body;
            return true;
          }
        )
        .reply(200, created);

      const agent = base44.superagent.forApp(superagentAppId);
      const result = await agent.createConversation({
        metadata: { source: "help-widget" },
      });

      expect(result).toEqual(created);
      expect(capturedBody).toEqual({
        agent_name: "your_agent",
        metadata: { source: "help-widget" },
      });
    });

    test("should default to an empty payload with agent_name your_agent", async () => {
      const created = { id: "conv-new", agent_name: "your_agent", messages: [] };
      let capturedBody: any;
      scope
        .post(
          `/api/apps/${superagentAppId}/agents/conversations`,
          (body) => {
            capturedBody = body;
            return true;
          }
        )
        .reply(200, created);

      const result = await base44.superagent
        .forApp(superagentAppId)
        .createConversation();

      expect(result).toEqual(created);
      expect(capturedBody).toEqual({ agent_name: "your_agent" });
    });
  });

  describe("listConversations", () => {
    test("should fetch conversations from the superagent app path", async () => {
      const mockConversations = [
        { id: "conv-1", agent_name: "your_agent", messages: [] },
        { id: "conv-2", agent_name: "your_agent", messages: [] },
      ];
      scope
        .get(`/api/apps/${superagentAppId}/agents/conversations`)
        .reply(200, mockConversations);

      const result = await base44.superagent
        .forApp(superagentAppId)
        .listConversations();
      expect(result).toEqual(mockConversations);
    });
  });

  describe("getConversation", () => {
    test("should fetch a specific conversation", async () => {
      const mockConversation = {
        id: "conv-1",
        agent_name: "your_agent",
        messages: [],
      };
      scope
        .get(`/api/apps/${superagentAppId}/agents/conversations/conv-1`)
        .reply(200, mockConversation);

      const result = await base44.superagent
        .forApp(superagentAppId)
        .getConversation("conv-1");
      expect(result).toEqual(mockConversation);
    });
  });

  describe("addMessage", () => {
    test("should post to the v2 messages endpoint", async () => {
      const conversation = {
        id: "conv-1",
        agent_name: "your_agent",
        messages: [],
      } as any;
      const response = { id: "msg-1", role: "assistant", content: "Hello!" };
      scope
        .post(
          `/api/apps/${superagentAppId}/agents/conversations/v2/conv-1/messages`
        )
        .reply(200, response);

      const result = await base44.superagent
        .forApp(superagentAppId)
        .addMessage(conversation, { role: "user", content: "Hi" });
      expect(result).toEqual(response);
    });
  });

  describe("anonymous auth isolation", () => {
    test("should send X-App-Id of the superagent app and no Authorization, even when the host client has a token", async () => {
      const authedClient = createClient({
        serverUrl,
        appId: hostAppId,
        token: "host-app-token",
      });

      let capturedHeaders: Record<string, unknown> | undefined;
      scope
        .get(`/api/apps/${superagentAppId}/agents/conversations`)
        .reply(200, function () {
          capturedHeaders = this.req.headers;
          return [];
        });

      await authedClient.superagent.forApp(superagentAppId).listConversations();

      expect(capturedHeaders?.["x-app-id"]).toBe(superagentAppId);
      expect(capturedHeaders?.["authorization"]).toBeUndefined();
    });
  });
});
