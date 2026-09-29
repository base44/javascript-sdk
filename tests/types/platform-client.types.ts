import { Base44PlatformClient, type PlatformEvent, type Snapshot, type ToolCall } from "@base44/sdk/platform/client";
const client = new Base44PlatformClient({ serverUrl: "https://example.test", getSessionToken: async () => "session-token" });
const builder = client.builder.init({ onError: error => { void error.code; } });
const subscription = builder.subscribe("a".repeat(24), {
  onSnapshot(snapshot: Snapshot) {
    const state: "ready" | "processing" | "error" | undefined = snapshot.status?.state;
    void state;
    void snapshot.messages[0]?.additional_message_params?.plan_mode;
  },
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
    // @ts-expect-error There is no replay cursor.
    void event.seq;
  },
  onError: error => { void error.appId; },
});
void subscription.active;
// @ts-expect-error There is no replay cursor.
void subscription.cursor;
// @ts-expect-error Subscriptions take snapshots, not cursors.
builder.subscribe("a".repeat(24), { afterSeq: "saved", onSnapshot() {}, onEvent() {}, onError() {} });
// @ts-expect-error No browser mutation channel.
client.send("write_file", {});
// @ts-expect-error API keys are not browser credentials.
new Base44PlatformClient({ apiKey: "private" });
// @ts-expect-error Socket methods belong to the builder session.
client.connect();
// @ts-expect-error The retired token callback is not accepted.
new Base44PlatformClient({ serverUrl: "https://example.test", refreshToken: async () => "token" });

const tool: ToolCall = {
  display_projection: { file_paths: ["src/App.tsx"] },
  arguments_string: JSON.stringify({ questions: [{ question: "Which layout?", options: [{ label: "Cards" }] }] }),
  user_input: { answers: [{ question_index: 0, selected_labels: ["Cards"] }] },
  results: "Plan updated.",
};
void tool;
const guarded: ToolCall = {
  status: "waiting_for_user_input",
  waiting_on: { kind: "approval" },
  results: { guard: "entity_rls_guard", reason: "RLS rules on entity 'Order' will be modified", details: { entity_name: "Order", changed_ops: ["read"] } },
};
void guarded;
const generatedMedia: ToolCall = {
  results: {
    placeholder_url: "/__generating__/hero.png",
    status: "completed",
    image_url: "https://images.example/hero.png",
  },
};
void generatedMedia;
// @ts-expect-error Raw command text is not part of reviewed display metadata.
void tool.display_projection?.command;
