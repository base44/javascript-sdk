import { createPlatformServer, WebhookConfigurationError, WebhookVerificationError } from "@base44/platform/server";

const platform = createPlatformServer({
  serverUrl: "https://base44.app",
  apiKey: process.env.BASE44_API_KEY!,
});

// Your workspace's public keys. Pass both during a key rotation.
const publicKeys = process.env.BASE44_WEBHOOK_PUBLIC_KEYS!;

/** verifyEvent + switch: full control over the response. See server-webhooks-handler.ts for the managed variant. */
export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text(); // exactly as received: never JSON.parse + stringify first

  let event;
  try {
    event = await platform.webhooks.verifyEvent(rawBody, request.headers, { publicKeys });
  } catch (error) {
    if (error instanceof WebhookVerificationError) return Response.json({ error: error.code }, { status: 400 });
    if (error instanceof WebhookConfigurationError) console.error(error.message); // 500: Base44 retries
    throw error;
  }

  switch (event.type) {
    case "webhook.test.v1":
      // Activation probe: echo the challenge (within 5 seconds) to activate the endpoint.
      return Response.json({ challenge: event.data.challenge });
    case "app.deleted.v1":
      console.log("trashed (restorable for 30 days):", event.data.app_id);
      break;
    default:
      break; // Unhandled types still get a 2xx, or Base44 retries and eventually pauses the endpoint.
  }
  return new Response(null, { status: 204 });
}
