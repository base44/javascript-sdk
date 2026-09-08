import { http, HttpResponse } from "msw";
import { recordRequest, state, type PlatformConversation } from "./state";

// Pinned Apper d9ae151 enforces caller ownership/visitor rules, strips
// reserved metadata, and redacts public conversations. This in-memory model
// intentionally covers SDK-visible conversation transitions only; it does not
// claim to reproduce that authorization and redaction policy.
export const agentHandlers = [
  http.get("*/api/apps/:appId/agents/conversations", async ({ request }) => {
    await recordRequest("agents.listConversations", request);
    return HttpResponse.json(state.conversations);
  }),
  http.get("*/api/apps/:appId/agents/conversations/:conversationId", async ({ params, request }) => {
    await recordRequest("agents.getConversation", request);
    const conversation = state.conversations.find(
      (item) => item.id === params.conversationId,
    );
    return conversation
      ? HttpResponse.json(conversation)
      : HttpResponse.json({ detail: "Conversation not found", code: "NOT_FOUND" }, { status: 404 });
  }),
  http.post("*/api/apps/:appId/agents/conversations", async ({ request }) => {
    await recordRequest("agents.createConversation", request);
    const input = (await request.clone().json()) as Pick<PlatformConversation, "agent_name">;
    const conversation: PlatformConversation = {
      id: `conv-${state.nextConversationId++}`,
      agent_name: input.agent_name,
      messages: [],
    };
    state.conversations.push(conversation);
    return HttpResponse.json(conversation);
  }),
  http.post(
    "*/api/apps/:appId/agents/conversations/v2/:conversationId/messages",
    async ({ params, request }) => {
      await recordRequest("agents.addMessage", request);
      const input = (await request.clone().json()) as Record<string, any>;
      const conversation = state.conversations.find(
        (item) => item.id === params.conversationId,
      );
      if (!conversation)
        return HttpResponse.json({ detail: "Conversation not found", code: "NOT_FOUND" }, { status: 404 });
      const message = { id: `msg-${state.nextMessageId++}`, ...input };
      conversation.messages.push(message);
      return HttpResponse.json(message);
    },
  ),
];
