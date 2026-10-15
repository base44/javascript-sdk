import {
  createPlatformServer, type AppCreatedV1Data, type WebhookEvent, type WebhookEventMap, type WebhookTestV1Data,
} from "@base44/platform/server";

const platform = createPlatformServer();
const publicKeys = ["whpk_x"];

async function handle(body: string, headers: Headers) {
  const event = await platform.webhooks.verifyEvent(body, headers, { publicKeys, toleranceSeconds: 60 });
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
    case "unknown": {
      const name: string = event.name;
      const data: Record<string, unknown> = event.data;
      // @ts-expect-error An unknown event's data isn't typed, so check a field before using it.
      const appId: string = event.data.app_id;
      void name; void data; void appId;
      break;
    }
    default: {
      // A default branch still sees the event (the remaining known types), so it can be logged.
      const type: "app.unpublished.v1" | "app.restored.v1" = event.type;
      void type;
    }
  }
}
void handle;

// The handler's callbacks see unknown events too, and `on.unknown` handles every type this SDK doesn't know.
platform.webhooks.createHandler({
  publicKeys,
  onEvent: event => { if (event.type === "unknown") { const name: string = event.name; void name; } },
  on: { unknown: event => { const name: string = event.name; void name; } },
});

// Examples published with the schemas must stay assignable to the generated types.
const created: AppCreatedV1Data = {
  app_id: "68b0c1d2e3f4a5b6c7d8e9f0", workspace_id: "68a1b2c3d4e5f6a7b8c9d0e1", owner_id: "6899aabbccddeeff00112233",
  owner_service_external_id: "sunny-9f2c4a", app_type: "user_app", created_at: "2026-09-01T10:15:30.123Z",
};
const probe: WebhookTestV1Data = { endpoint_id: "e", workspace_id: "w", sent_at: "2026-09-01T10:15:30.123Z", challenge: "8f14e45f" };
const map: Pick<WebhookEventMap, "app.created.v1" | "webhook.test.v1"> = { "app.created.v1": created, "webhook.test.v1": probe };
void map;

const route: (request: Request) => Promise<Response> = platform.webhooks.createHandler({
  publicKeys,
  toleranceSeconds: 60,
  on: {
    "app.deleted.v1": event => { const at: string = event.data.deleted_at; void at; },
    // @ts-expect-error Each handler gets its own event type.
    "app.published.v1": event => { void event.data.deleted_at; },
  },
  onEvent: event => { void event.id; },
  onSuccess: () => new Response(null, { status: 202 }),
  onError: (error, event) => { void error; void event?.type; },
});
void route;
platform.webhooks.createHandler({
  publicKeys,
  // @ts-expect-error The activation probe is answered by the handler and cannot be handled.
  on: { "webhook.test.v1": () => {} },
});
// @ts-expect-error The probe never reaches onEvent.
platform.webhooks.createHandler({ publicKeys, onEvent: event => event.type === "webhook.test.v1" });
// @ts-expect-error Unknown option.
platform.webhooks.verifyEvent("", new Headers(), { publicKeys, secret: "x" });
// @ts-expect-error Public keys are required.
platform.webhooks.verifyEvent("", new Headers());
// @ts-expect-error Public keys are required.
platform.webhooks.createHandler({ on: {} });
// @ts-expect-error The factory takes no options; keys are passed to the webhook functions.
createPlatformServer({ webhooks: { publicKeys } });
const event = null as unknown as WebhookEvent;
// @ts-expect-error Unknown event type.
if (event.type === "app.exploded.v1") void event;
