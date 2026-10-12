import {
  createPlatformServer, type AppCreatedV1Data, type WebhookEvent, type WebhookEventMap, type WebhookTestV1Data,
} from "@base44/platform/server";

const platform = createPlatformServer({ serverUrl: "https://example.test", apiKey: "key", webhooks: { publicKeys: ["whpk_x"] } });

async function handle(body: string, headers: Headers) {
  const event = await platform.webhooks.verifyEvent(body, headers, { toleranceSeconds: 60 });
  switch (event.type) {
    case "app.created.v1": {
      const appType: "imported_app" | "user_agent" | "user_app" | "user_game" = event.data.app_type;
      void appType;
      // @ts-expect-error Only app.created.v1 has app_type narrowed here, not published_version.
      void event.data.published_version;
      break;
    }
    case "app.published.v1": { const version: string = event.data.published_version; void version; break; }
    case "app.deleted.v1": { const at: string = event.data.deleted_at; void at; break; }
    case "webhook.test.v1": { const challenge: string = event.data.challenge; void challenge; break; }
    default: { const id: string = event.id; void id; }
  }
  const response: { challenge: string } | undefined = platform.webhooks.handleChallenge(event);
  void response;
}
void handle;

// Examples published with the schemas must stay assignable to the generated types.
const created: AppCreatedV1Data = {
  app_id: "68b0c1d2e3f4a5b6c7d8e9f0", workspace_id: "68a1b2c3d4e5f6a7b8c9d0e1", owner_id: "6899aabbccddeeff00112233",
  owner_service_external_id: "sunny-9f2c4a", app_type: "user_app", created_at: "2026-09-01T10:15:30.123Z",
};
const probe: WebhookTestV1Data = { endpoint_id: "e", workspace_id: "w", sent_at: "2026-09-01T10:15:30.123Z", challenge: "8f14e45f" };
const map: Pick<WebhookEventMap, "app.created.v1" | "webhook.test.v1"> = { "app.created.v1": created, "webhook.test.v1": probe };
void map;

// @ts-expect-error The challenge handler takes a verified event, not a raw body.
platform.webhooks.handleChallenge("{}");
// @ts-expect-error Unknown option.
platform.webhooks.verifyEvent("", new Headers(), { secret: "x" });
const event = null as unknown as WebhookEvent;
// @ts-expect-error Unknown event type.
if (event.type === "app.exploded.v1") void event;
