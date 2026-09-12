import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { createClient } from "../../src/index.ts";
import { platform } from "../mocks/platform";

describe("Agents Module", () => {
  let base44: ReturnType<typeof createClient>;
  const serverUrl = "https://api.base44.com";
  const appId = "test-app-id";
  const userToken = "agent-user-token";
  const userId = "agent-user";

  beforeEach(() => {
    platform.reset();
    platform.given.app(appId).auth.principal(userToken, { id: userId });
    base44 = createClient({ serverUrl, appId, token: userToken });
  });

  afterEach(() => base44.cleanup());

  test("getConversations() returns arranged conversations", async () => {
    const conversations = [
      { id: "conv-1", agent_name: "support", messages: [] },
      { id: "conv-2", agent_name: "sales", messages: [] },
    ];
    platform.given
      .app(appId)
      .agents.conversationsForUser(userId, conversations);

    await expect(base44.agents.getConversations()).resolves.toEqual(
      conversations,
    );
    expect(platform.requests.count("agents.listConversations")).toBe(1);
  });

  test("getConversation() returns one arranged conversation", async () => {
    const conversation = { id: "conv-1", agent_name: "support", messages: [] };
    platform.given
      .app(appId)
      .agents.conversationsForUser(userId, [conversation]);

    await expect(base44.agents.getConversation("conv-1")).resolves.toEqual(
      conversation,
    );
  });

  test("createConversation() persists so list and get observe it", async () => {
    const created = await base44.agents.createConversation({
      agent_name: "support",
    });

    expect(created).toEqual({
      id: "conv-1",
      agent_name: "support",
      messages: [],
    });
    await expect(base44.agents.getConversation(created.id)).resolves.toEqual(
      created,
    );
    await expect(base44.agents.getConversations()).resolves.toContainEqual(
      created,
    );
    expect(platform.requests.last("agents.createConversation").body).toEqual({
      agent_name: "support",
    });
  });

  test("addMessage() posts to v2 and updates conversation state", async () => {
    const conversation = { id: "conv-1", agent_name: "support", messages: [] };
    platform.given
      .app(appId)
      .agents.conversationsForUser(userId, [conversation]);

    const message = await base44.agents.addMessage(conversation, {
      role: "user",
      content: "Hi",
    });

    expect(message).toEqual({ id: "msg-1", role: "user", content: "Hi" });
    await expect(
      base44.agents.getConversation("conv-1"),
    ).resolves.toMatchObject({
      messages: [message],
    });
    expect(platform.requests.last("agents.addMessage").body).toEqual({
      role: "user",
      content: "Hi",
    });
  });

  test("getWhatsAppConnectURL omits the token when unauthenticated", () => {
    const anonymous = createClient({ serverUrl, appId });
    expect(anonymous.agents.getWhatsAppConnectURL("support")).toBe(
      `${serverUrl}/api/apps/${appId}/agents/support/whatsapp`,
    );
    anonymous.cleanup();
  });

  test("getWhatsAppConnectURL includes the token when authenticated", () => {
    const authed = createClient({ serverUrl, appId, token: "test-token" });
    expect(authed.agents.getWhatsAppConnectURL("support")).toBe(
      `${serverUrl}/api/apps/${appId}/agents/support/whatsapp?token=test-token`,
    );
    authed.cleanup();
  });

  test("getWhatsAppConnectURL encodes the agent name", () => {
    expect(base44.agents.getWhatsAppConnectURL("my agent")).toBe(
      `${serverUrl}/api/apps/${appId}/agents/my%20agent/whatsapp?token=${userToken}`,
    );
  });

  test("getTelegramConnectURL omits the token when unauthenticated", () => {
    const anonymous = createClient({ serverUrl, appId });
    expect(anonymous.agents.getTelegramConnectURL("support")).toBe(
      `${serverUrl}/api/apps/${appId}/agents/support/telegram`,
    );
    anonymous.cleanup();
  });

  test("getTelegramConnectURL includes the token when authenticated", () => {
    const authed = createClient({ serverUrl, appId, token: "test-token" });
    expect(authed.agents.getTelegramConnectURL("support")).toBe(
      `${serverUrl}/api/apps/${appId}/agents/support/telegram?token=test-token`,
    );
    authed.cleanup();
  });

  test("getTelegramConnectURL encodes the agent name", () => {
    expect(base44.agents.getTelegramConnectURL("my agent")).toBe(
      `${serverUrl}/api/apps/${appId}/agents/my%20agent/telegram?token=${userToken}`,
    );
  });

  test("isolates conversations by application and user principal", async () => {
    const otherAppId = "other-agent-app";
    const otherToken = "other-agent-token";
    const otherClient = createClient({
      serverUrl,
      appId: otherAppId,
      token: otherToken,
    });
    const sameAppOtherToken = "same-app-other-token";
    const sameAppOther = createClient({
      serverUrl,
      appId,
      token: sameAppOtherToken,
    });
    platform.given
      .app(otherAppId)
      .auth.principal(otherToken, { id: "other-user" });
    platform.given
      .app(appId)
      .auth.principal(sameAppOtherToken, { id: "same-app-other" });
    const conversation = { id: "conv-1", agent_name: "support", messages: [] };
    platform.given
      .app(appId)
      .agents.conversationsForUser(userId, [conversation]);

    await expect(base44.agents.getConversations()).resolves.toEqual([
      conversation,
    ]);
    await expect(otherClient.agents.getConversations()).resolves.toEqual([]);
    await expect(sameAppOther.agents.getConversations()).resolves.toEqual([]);
    await expect(
      otherClient.agents.getConversation("conv-1"),
    ).rejects.toMatchObject({
      status: 403,
      message: "Access denied: conversation belongs to another app",
    });
    await expect(
      sameAppOther.agents.addMessage(conversation, {
        role: "user",
        content: "leak",
      }),
    ).rejects.toMatchObject({
      status: 403,
      message: "Access denied: conversation belongs to another user",
    });
    await expect(base44.agents.getConversation("conv-1")).resolves.toEqual(
      conversation,
    );
    otherClient.cleanup();
    sameAppOther.cleanup();
  });

  test("requires a user or visitor identity to create conversations", async () => {
    const anonymous = createClient({ serverUrl, appId });
    await expect(anonymous.agents.getConversations()).resolves.toEqual([]);
    await expect(
      anonymous.agents.createConversation({ agent_name: "support" }),
    ).rejects.toMatchObject({
      status: 401,
      message: "User must be authenticated to create a conversation",
    });
    anonymous.cleanup();
  });

  test("isolates anonymous visitor conversations", async () => {
    const visitorA = createClient({
      serverUrl,
      appId,
      headers: { "X-Base44-Anonymous-Id": "visitor-a" },
    });
    const visitorB = createClient({
      serverUrl,
      appId,
      headers: { "X-Base44-Anonymous-Id": "visitor-b" },
    });
    platform.given
      .app(appId)
      .agents.conversationsForVisitor("visitor-a", [
        { id: "conv-visitor", agent_name: "guide", messages: [] },
      ]);
    await expect(visitorA.agents.getConversations()).resolves.toHaveLength(1);
    await expect(visitorB.agents.getConversations()).resolves.toEqual([]);
    await expect(
      visitorB.agents.getConversation("conv-visitor"),
    ).rejects.toMatchObject({
      status: 403,
      message: "Access denied: conversation belongs to another visitor",
    });
    visitorA.cleanup();
    visitorB.cleanup();
  });

  test("reset() isolates conversations and request history", async () => {
    platform.given
      .app(appId)
      .agents.conversationsForUser(userId, [
        { id: "conv-1", agent_name: "support", messages: [] },
      ]);
    await base44.agents.getConversations();

    platform.reset();

    await expect(base44.agents.getConversations()).resolves.toEqual([]);
    expect(platform.requests.count("agents.listConversations")).toBe(1);
  });
});
