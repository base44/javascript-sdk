import { createPlatformClient, type PlatformEvent } from "@base44/platform";

const client = createPlatformClient();
const chat = client.chat.init({
  // Your backend opens the session with its workspace key and returns the Create socket session body.
  async getSession() {
    const response = await fetch("/api/chat-socket-session", { method: "POST" });
    if (!response.ok) throw new Error("Unable to open a socket session");
    return response.json();
  },
  onError(error) { console.error(error.code); },
});

const subscription = chat.subscribe("0123456789abcdef01234567", {
  onSnapshot(snapshot) {
    // Replace this app's state; merge messages by id to keep history older than the last 50.
    console.log(snapshot.status?.state, snapshot.messages.length);
  },
  async onEvent(event: PlatformEvent) {
    // Replace messages by id; omitted keys mean unchanged, explicit null clears.
    if (event.type === "message.updated") console.log(event.data.message.content);
    if (event.type === "message.removed") console.log("removed", event.data.message_id);
  },
  onError(error) {
    // access_revoked: the app left the session's allowlist; do not resubscribe.
    console.error(error.code);
  },
});

await chat.connect();
// Later, during teardown:
subscription.unsubscribe();
chat.close();
