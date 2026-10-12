"use server";
// The four calls the hook needs, as Next.js server functions. They run only on the server, with
// the partner's credentials, so the browser never sees them. Any backend language works: the hook
// only needs functions with these signatures.
import type { Base44App, LiveSession, ToolCallAnswer } from "@base44/platform/react";

const host = process.env.BASE44_PLATFORM_HOST!;
const workspaceId = process.env.BASE44_WORKSPACE_ID!;

// The Apps API takes the integration account's personal access token.
function headers() {
  return {
    Authorization: `Bearer ${process.env.BASE44_ACCESS_TOKEN}`,
    "X-Active-Workspace-Id": workspaceId,
    "Content-Type": "application/json",
  };
}

// POST /api/apps: create an app from its first prompt. The build starts inside this call.
export async function createApp(prompt: string): Promise<Base44App> {
  const response = await fetch(`${host}/api/apps`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ organization_id: workspaceId, name: prompt.slice(0, 80), initial_message: { content: prompt } }),
  });
  if (!response.ok) throw new Error(`Create app failed: ${response.status}`);
  const app = await response.json();
  return { id: app.id, name: app.name };
}

// POST /api/service/socket-sessions: a read-only live-updates session for one app. It takes the
// workspace key; the browser gets only the session token.
export async function openLiveSession(appId: string): Promise<LiveSession> {
  const response = await fetch(`${host}/api/service/socket-sessions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.BASE44_SVC_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ app_ids: [appId] }),
  });
  if (!response.ok) throw new Error(`Socket session failed: ${response.status}`);
  const session = await response.json();
  return { serverUrl: new URL(session.socket_url).origin, sessionToken: session.session_token };
}

// POST /api/apps/{id}/chat/message: every prompt after the first.
export async function sendMessage(appId: string, content: string): Promise<void> {
  const request = fetch(`${host}/api/apps/${appId}/chat/message`, { method: "POST", headers: headers(), body: JSON.stringify({ content }) });
  await acceptedOrRunning(request, "Send message");
}

// POST /api/apps/{id}/chat/submit-tool-call-input: answer a question the builder waits on, or
// decline it. The request id stays the same on a retry, so Base44 resumes the turn only once.
export async function submitToolCallInput(appId: string, answer: ToolCallAnswer): Promise<void> {
  const request = fetch(`${host}/api/apps/${appId}/chat/submit-tool-call-input`, {
    method: "POST",
    headers: { ...headers(), "X-Request-ID": `submit-${answer.toolCallId}` },
    body: JSON.stringify({
      tool_call_id: answer.toolCallId,
      message_id: answer.messageId,
      action: answer.approve ? "approved" : "rejected",
      extra_user_input: answer.extraUserInput ?? {},
    }),
  });
  await acceptedOrRunning(request, "Submit answer");
}

// Send and submit stay open for the whole turn. Wait only long enough to catch a refusal; the live
// session shows the rest.
async function acceptedOrRunning(request: Promise<Response>, call: string) {
  const response = await Promise.race([request, new Promise<null>((resolve) => setTimeout(resolve, 3000, null))]);
  if (response && !response.ok) throw new Error(`${call} failed: ${response.status}`);
}
