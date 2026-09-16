import { Base44PlatformClient, type PlatformEvent } from "@base44/sdk/platform/client";
const client = new Base44PlatformClient({ serverUrl: "https://example.test", getToken: async () => "token", onError: error => { void error.code; } });
const subscription = client.subscribe("a".repeat(24), {
  onEvent(event: PlatformEvent) {
    if (event.type === "update_model") {
      const content: string | null | undefined = event.data._last_msg?.content;
      void content;
      // @ts-expect-error Private billing fields are not a public contract.
      void event.data.credits;
    }
    if (event.type === "image_ready") {
      const status: "pending" | "completed" | "failed" = event.data.status;
      void status;
    }
    // @ts-expect-error Payload must be narrowed by event.type.
    void event.data.items;
  },
  onError: error => { void error.appId; },
});
// @ts-expect-error No browser mutation channel.
client.send("write_file", {});
// @ts-expect-error Cursor is read-only.
subscription.cursor = "invented";
// @ts-expect-error API keys are not browser credentials.
new Base44PlatformClient({ apiKey: "private" });
