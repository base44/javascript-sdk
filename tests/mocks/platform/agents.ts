import { http, HttpResponse } from "msw";
import { recordRequest, state, type PlatformConversation } from "./state";
import { principalFor } from "./auth";

function identity(appId: string, request: Request) {
  const principal = principalFor(appId, request)?.principal;
  if (principal) return { kind: "user" as const, id: principal.user.id };
  const visitorId = request.headers.get("x-base44-anonymous-id");
  return visitorId ? { kind: "visitor" as const, id: visitorId } : undefined;
}

function forbidden(message: string) {
  return HttpResponse.json({ detail: message }, { status: 403 });
}

function authorizedConversation(
  appId: string,
  request: Request,
  conversationId: string,
) {
  const stored = state.conversations.get(conversationId);
  if (!stored)
    return {
      response: HttpResponse.json(
        { detail: "Conversation not found", code: "NOT_FOUND" },
        { status: 404 },
      ),
    };
  if (stored.appId !== appId)
    return {
      response: forbidden("Access denied: conversation belongs to another app"),
    };
  const caller = identity(appId, request);
  if (
    !caller ||
    caller.kind !== stored.owner.kind ||
    caller.id !== stored.owner.id
  )
    return {
      response: forbidden(
        `Access denied: conversation belongs to another ${stored.owner.kind}`,
      ),
    };
  return { stored };
}

// Pinned Apper d9ae151 app/owner/visitor authorization is modeled here.
// Reserved metadata stripping, public redaction, internal/room filtering and
// actual LLM generation remain explicit unsupported policy boundaries.
export const agentHandlers = [
  http.get(
    "*/api/apps/:appId/agents/conversations",
    async ({ params, request }) => {
      await recordRequest("agents.listConversations", request);
      const appId = String(params.appId);
      const caller = identity(appId, request);
      if (!caller) return HttpResponse.json([]);
      return HttpResponse.json(
        [...state.conversations.values()]
          .filter(
            (item) =>
              item.appId === appId &&
              item.owner.kind === caller.kind &&
              item.owner.id === caller.id,
          )
          .map((item) => item.record),
      );
    },
  ),
  http.get(
    "*/api/apps/:appId/agents/conversations/:conversationId",
    async ({ params, request }) => {
      await recordRequest("agents.getConversation", request);
      const resolved = authorizedConversation(
        String(params.appId),
        request,
        String(params.conversationId),
      );
      return resolved.response ?? HttpResponse.json(resolved.stored!.record);
    },
  ),
  http.post(
    "*/api/apps/:appId/agents/conversations",
    async ({ params, request }) => {
      await recordRequest("agents.createConversation", request);
      const appId = String(params.appId);
      const owner = identity(appId, request);
      if (!owner)
        return HttpResponse.json(
          { detail: "User must be authenticated to create a conversation" },
          { status: 401 },
        );
      const input = (await request.clone().json()) as Pick<
        PlatformConversation,
        "agent_name"
      >;
      const conversation: PlatformConversation = {
        id: `conv-${state.nextConversationId++}`,
        agent_name: input.agent_name,
        messages: [],
      };
      state.conversations.set(conversation.id, {
        appId,
        owner,
        record: conversation,
      });
      return HttpResponse.json(conversation);
    },
  ),
  http.post(
    "*/api/apps/:appId/agents/conversations/v2/:conversationId/messages",
    async ({ params, request }) => {
      await recordRequest("agents.addMessage", request);
      const input = (await request.clone().json()) as Record<string, any>;
      const resolved = authorizedConversation(
        String(params.appId),
        request,
        String(params.conversationId),
      );
      if (resolved.response) return resolved.response;
      const message = { id: `msg-${state.nextMessageId++}`, ...input };
      resolved.stored!.record.messages.push(message);
      return HttpResponse.json(message);
    },
  ),
];
