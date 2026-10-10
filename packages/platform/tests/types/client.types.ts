import { createPlatformClient, type PlatformEvent, type PlatformEventMap, type PlatformSnapshot, type ToolCall, type GuardApproval, type Message, type StatusObject } from "@base44/platform";
const client = createPlatformClient({ socketUrl: "https://example.test", getSessionToken: async () => "session-token" });
const builder = client.builder.init({ onError: error => { void error.code; } });
const subscription = builder.subscribe("a".repeat(24), {
  onSnapshot(snapshot: PlatformSnapshot) {
    const state: "ready" | "processing" | "error" | null | undefined = snapshot.status?.state;
    const room: string = snapshot.room;
    void room;
    void snapshot.queue.items;
    void state;
    void snapshot.messages[0]?.additional_message_params?.plan_mode;
  },
  onEvent(event: PlatformEvent) {
    if (event.type === "message.updated") {
      const content: string | null | undefined = event.data.message.content;
      void content;
      // @ts-expect-error Private billing fields are not a public contract.
      void event.data.message.usage;
    }
    if (event.type === "message.removed") {
      const id: string = event.data.message_id;
      void id;
    }
    if (event.type === "image.resolved") {
      const status: "pending" | "completed" | "failed" | null | undefined = event.data.status;
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
createPlatformClient({ apiKey: "private" });
// @ts-expect-error Socket methods belong to the builder session.
client.connect();
// @ts-expect-error The retired token callback is not accepted.
createPlatformClient({ socketUrl: "https://example.test", refreshToken: async () => "token" });

const tool: ToolCall = {
  name: "ask_clarifying_questions",
  arguments: { questions: [{ question: "Which layout?", options: [{ label: "Cards" }] }] },
  user_input: { answers: [{ question_index: 0, selected_labels: ["Cards"] }] },
};
void tool;
const write: ToolCall = { name: "write_file", display: { file_paths: ["src/App.tsx"] } };
void write;
function describe(call: ToolCall) {
  if (call.name === "generate_image" && "results" in call) void call.results;
  // @ts-expect-error Narrowing by name leaves only that tool's fields (and the catch-all call's).
  if (call.name === "bash") void call.display;
}
void describe;
const guarded: ToolCall = {
  name: "update_entities",
  status: "waiting_for_user_input",
  waiting_on: { kind: "approval" },
  approval: { guard: "entity_rls_guard", details: { entity_name: "Order", changed_ops: ["read"] } },
};
void guarded;
const approval: GuardApproval = { guard: "some_new_guard" };
void approval;
// @ts-expect-error Every tool call names its tool.
const unnamed: ToolCall = { status: "running" };
void unnamed;
// @ts-expect-error Raw arguments are never delivered.
void tool.arguments_string;
const message: Message = { id: "m1", role: "assistant", content: "Done", tool_calls: [tool] };
void message;
const status: StatusObject = { state: "processing", turn_id: "m1" };
void status;
// @ts-expect-error Session events are handled by the client, not delivered to onEvent.
type NoSnapshot = PlatformEventMap["app.snapshot"];
// @ts-expect-error Room notices arrive through onError.
type NoNotice = PlatformEventMap["room.access_denied"];
