import { createPlatformServer, WebhookConfigurationError, WebhookVerificationError } from "@base44/platform/server";

const platform = createPlatformServer({
  serverUrl: "https://base44.app",
  apiKey: process.env.BASE44_API_KEY!,
  // Public keys of your workspace. Pass both during a key rotation.
  webhooks: { publicKeys: process.env.BASE44_WEBHOOK_PUBLIC_KEYS },
});

/** Fetch-style route handler (Next.js, Hono, Workers, Deno, Bun). */
export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text(); // exactly as received: never JSON.parse + stringify first

  let event;
  try {
    event = await platform.webhooks.verifyEvent(rawBody, request.headers);
  } catch (error) {
    if (error instanceof WebhookVerificationError) return Response.json({ error: error.code }, { status: 400 });
    if (error instanceof WebhookConfigurationError) console.error(error.message); // 500: Base44 retries
    throw error;
  }

  // Activation: echo the challenge, only after the signature verified (5 second budget).
  const challenge = platform.webhooks.handleChallenge(event);
  if (challenge) return Response.json(challenge);

  switch (event.type) {
    case "app.deleted.v1":
      console.log("trashed (restorable for 30 days):", event.data.app_id);
      break;
    default:
      break; // Unhandled types still get a 2xx, or Base44 retries and eventually pauses the endpoint.
  }
  return new Response(null, { status: 204 });
}
