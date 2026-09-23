import { Base44PlatformClient, type PlatformEvent } from "@base44/sdk/platform/client";

const client = new Base44PlatformClient({
  serverUrl: "https://base44.app",
  async refreshToken() {
    const response = await fetch("/api/platform/browser-token", { method: "POST" });
    if (!response.ok) throw new Error("Unable to obtain browser credential");
    const { token } = await response.json();
    return token;
  },
});
const builder = client.builder.init({
  onError(error) { console.error(error.code); },
});

const subscription = builder.subscribe("0123456789abcdef01234567", {
  async onEvent(event: PlatformEvent) {
    if (event.type === "update_model") {
      // Apply omitted keys as unchanged and _last_msg as a replacement by id.
      console.log(event.data._last_msg?.content);
    }
    // Await your state update here. The cursor advances only after this returns.
  },
  onJoined(boundary) { console.log("Live boundary", boundary.seq); },
  onError(error) {
    // For resync_required, reconcile through your backend before a fresh subscription.
    console.error(error.code);
  },
});

await builder.connect();
// Later, during teardown:
subscription.unsubscribe();
builder.close();
