import { Base44PlatformClient, type PlatformEvent, type ToolCall } from "@base44/sdk/platform/client";
const client = new Base44PlatformClient({ serverUrl: "https://example.test", refreshToken: async () => "token" });
const builder = client.builder.init({ onError: error => { void error.code; } });
const subscription = builder.subscribe("a".repeat(24), {
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

// @ts-expect-error Socket methods belong to the builder session.
client.connect();
// @ts-expect-error Retired callback name is not accepted.
new Base44PlatformClient({ serverUrl: "https://example.test", getToken: async () => "token" });

const tool: ToolCall = {
  display_projection: { file_paths: ["src/App.tsx"] },
  arguments_string: JSON.stringify({ questions: [{ question: "Which layout?", options: [{ label: "Cards" }] }] }),
  user_input: { answers: [{ question_index: 0, selected_labels: ["Cards"] }] },
  results: "Plan updated.",
};
void tool;
// @ts-expect-error Raw command text is not part of reviewed display metadata.
void tool.display_projection?.command;
