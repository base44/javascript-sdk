import { createPlatformServer } from "@base44/platform/server";

const platform = createPlatformServer({
  serverUrl: "https://base44.app",
  apiKey: process.env.BASE44_API_KEY!,
  webhooks: { publicKeys: process.env.BASE44_WEBHOOK_PUBLIC_KEYS },
});

/**
 * createHandler: verification, the activation challenge and status codes are handled for you.
 * Works as-is as a Next.js route handler, a Hono/Workers/Deno/Bun fetch handler.
 */
export const POST = platform.webhooks.createHandler({
  on: {
    "app.deleted.v1": async event => {
      console.log("trashed (restorable for 30 days):", event.data.app_id);
    },
    "app.published.v1": async event => {
      console.log("published:", event.data.app_id, event.data.published_version);
    },
  },
  // Runs for every event (except the activation probe), before its handler in `on`.
  onEvent: event => console.log("received", event.type, event.id),
  onSuccess: event => console.log("handled", event.id), // return a Response to replace the default 204
  // Verification failure -> 400, bad config -> 500, handler threw -> 500 (Base44 retries).
  onError: (error, event) => console.error("webhook failed", event?.id, error),
});
