import { useBase44Chat, type Base44App, type Base44ChatServer } from "@base44/platform/react";

// Your backend's four routes. Each one calls Base44 with your credentials and returns only
// what the browser needs; the hook never sees a workspace key or an access token.
async function post<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`${url} failed: ${response.status}`);
  return response.status === 204 ? (undefined as T) : response.json();
}
const server: Base44ChatServer = {
  createApp: prompt => post("/api/builder/apps", { prompt }),
  openLiveSession: appId => post(`/api/builder/apps/${appId}/live-session`, {}),
  sendMessage: (appId, content) => post(`/api/builder/apps/${appId}/messages`, { content }),
  submitToolCallInput: (appId, answer) => post(`/api/builder/apps/${appId}/answers`, answer),
};

// In a component: the hook returns items to render and actions to wire to the UI.
export function useBuilderChat(appId: string | null, onAppCreated: (app: Base44App) => void) {
  const chat = useBase44Chat({ appId, server, onAppCreated });

  for (const item of chat.items) {
    console.log(item.role, item.text, item.steps.map(step => `${step.status} ${step.label}`));
    // An open question carries only the actions its kind allows; declining is always one of them.
    if (item.question?.kind === "approval") console.log("waiting for approval of", item.question.action);
  }
  if (chat.error) console.error(chat.error.code ?? "server", chat.error.message);

  return {
    ...chat,
    // The first prompt creates the app; every later one goes to it.
    submit: (prompt: string) => (appId ? chat.send(prompt) : chat.create(prompt)),
  };
}
