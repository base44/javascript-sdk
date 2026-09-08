import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { createClient } from "../../src/index.ts";
import { platform } from "../mocks/platform";

describe("Agents Module", () => {
  let base44: ReturnType<typeof createClient>;
  const serverUrl = "https://api.base44.com";
  const appId = "test-app-id";

  beforeEach(() => {
    platform.reset();
    base44 = createClient({ serverUrl, appId });
  });

  afterEach(() => base44.cleanup());

  test("getConversations() returns arranged conversations", async () => {
    const conversations = [
      { id: "conv-1", agent_name: "support", messages: [] },
      { id: "conv-2", agent_name: "sales", messages: [] },
    ];
    platform.given.agents.conversations(conversations);

    await expect(base44.agents.getConversations()).resolves.toEqual(conversations);
    expect(platform.requests.count("agents.listConversations")).toBe(1);
  });

  test("getConversation() returns one arranged conversation", async () => {
    const conversation = { id: "conv-1", agent_name: "support", messages: [] };
    platform.given.agents.conversations([conversation]);

    await expect(base44.agents.getConversation("conv-1")).resolves.toEqual(conversation);
  });

  test("createConversation() persists so list and get observe it", async () => {
    platform.given.agents.conversations([]);

    const created = await base44.agents.createConversation({ agent_name: "support" });

    expect(created).toEqual({ id: "conv-1", agent_name: "support", messages: [] });
    await expect(base44.agents.getConversation(created.id)).resolves.toEqual(created);
    await expect(base44.agents.getConversations()).resolves.toContainEqual(created);
    expect(platform.requests.last("agents.createConversation").body).toEqual({
      agent_name: "support",
    });
  });

  test("addMessage() posts to v2 and updates conversation state", async () => {
    const conversation = { id: "conv-1", agent_name: "support", messages: [] };
    platform.given.agents.conversations([conversation]);

    const message = await base44.agents.addMessage(conversation, {
      role: "user",
      content: "Hi",
    });

    expect(message).toEqual({ id: "msg-1", role: "user", content: "Hi" });
    await expect(base44.agents.getConversation("conv-1")).resolves.toMatchObject({
      messages: [message],
    });
    expect(platform.requests.last("agents.addMessage").body).toEqual({
      role: "user",
      content: "Hi",
    });
  });

  test("getWhatsAppConnectURL omits the token when unauthenticated", () => {
    expect(base44.agents.getWhatsAppConnectURL("support")).toBe(
      `${serverUrl}/api/apps/${appId}/agents/support/whatsapp`,
    );
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
      `${serverUrl}/api/apps/${appId}/agents/my%20agent/whatsapp`,
    );
  });

  test("getTelegramConnectURL omits the token when unauthenticated", () => {
    expect(base44.agents.getTelegramConnectURL("support")).toBe(
      `${serverUrl}/api/apps/${appId}/agents/support/telegram`,
    );
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
      `${serverUrl}/api/apps/${appId}/agents/my%20agent/telegram`,
    );
  });

  test("reset() isolates conversations and request history", async () => {
    platform.given.agents.conversations([
      { id: "conv-1", agent_name: "support", messages: [] },
    ]);
    await base44.agents.getConversations();

    platform.reset();

    await expect(base44.agents.getConversations()).resolves.toEqual([]);
    expect(platform.requests.count("agents.listConversations")).toBe(1);
  });
});
