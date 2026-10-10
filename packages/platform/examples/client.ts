import { createPlatformClient, type PlatformEvent } from "@base44/platform";

declare const socketUrl: string;

const client = createPlatformClient({
  socketUrl, // the session's socket_url, from POST /api/service/socket-sessions
  // Your backend opens the session with its workspace key and returns only the session token.
  async getSessionToken() {
    const response = await fetch("/api/builder-socket-session", { method: "POST" });
    if (!response.ok) throw new Error("Unable to open a socket session");
    const { session_token } = await response.json();
    return session_token;
  },
});
const builder = client.builder.init({
  onError(error) { console.error(error.code); },
});

const subscription = builder.subscribe("0123456789abcdef01234567", {
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

await builder.connect();
// Later, during teardown:
subscription.unsubscribe();
builder.close();
