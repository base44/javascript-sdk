# @base44/platform

```sh
npm install @base44/platform
```

The Platform SDK for white-label platforms built on Base44. It is independent of the app SDK
(`@base44/sdk`) and has two entrypoints:

- `@base44/platform`, for the browser: follow the AI chat of up to eight apps live over the
  platform's shared socket. It implements the read-only white-label socket contract. The
  workspace must have white-label sockets enabled; this SDK does not open sessions.
- `@base44/platform/server`, for your backend: verify the webhooks Base44 sends when apps are
  created, published, unpublished, trashed or restored. See
  [Receiving webhooks](#receiving-webhooks-server).

```ts
import { createPlatformClient } from "@base44/platform";

const client = createPlatformClient();
const builder = client.builder.init({
  // Returns the body of POST /api/service/socket-sessions, unchanged.
  async getSession() {
    const response = await fetch("/api/builder-socket-session", { method: "POST" });
    if (!response.ok) throw new Error("Session request failed");
    return response.json();
  },
  onError(error) { showConnectionError(error.code); },
});
const subscription = builder.subscribe(appId, {
  onSnapshot(snapshot) { replaceAppState(snapshot); },
  async onEvent(event) { await applyEvent(event); }, // awaited before the next event
  onError(error) { showSubscriptionError(error.code); },
});
await builder.connect();
// On view teardown:
subscription.unsubscribe();
builder.close();
```

## Receiving webhooks (server)

`@base44/platform/server` verifies Base44 outbound webhooks and answers the endpoint
activation challenge. It uses WebCrypto only (Node 20+, Deno, Bun, Workers, edge runtimes) and
makes no network calls: pass your workspace's public keys (`whpk_…`) to each call that verifies.

The simplest route is `createHandler`. It reads the raw body, verifies it, answers the
activation challenge and picks the status code: 400 for a delivery that fails verification,
500 when your keys are misconfigured or a callback throws (Base44 retries), 204 otherwise,
including for event types you have no handler for.

```ts
import { createPlatformServer } from "@base44/platform/server";

const platform = createPlatformServer({
  serverUrl: "https://base44.app",
  apiKey: process.env.BASE44_API_KEY!,
});
const publicKeys = process.env.BASE44_WEBHOOK_PUBLIC_KEYS!; // two keys during a rotation

export const POST = platform.webhooks.createHandler({
  publicKeys,
  on: {
    "app.deleted.v1": async event => forget(event.data.app_id), // event is narrowed per type
  },
  onEvent: event => log(event.type),      // every event, before its handler
  onSuccess: event => {},                 // return a Response to replace the 204
  onError: (error, event) => report(error), // return a Response to replace the 400/500
});
```

For full control, verify and dispatch yourself:

```ts
export async function POST(request: Request) {
  const rawBody = await request.text(); // exactly as received
  let event;
  try {
    event = await platform.webhooks.verifyEvent(rawBody, request.headers, { publicKeys });
  } catch (error) {
    if (error instanceof WebhookVerificationError) return new Response(null, { status: 400 });
    throw error; // missing/malformed keys: a 500, so Base44 retries
  }
  switch (event.type) {
    case "webhook.test.v1": return Response.json({ challenge: event.data.challenge }); // activates the endpoint
    case "app.deleted.v1": await forget(event.data.app_id); break;
  }
  return new Response(null, { status: 204 });
}
```

Delivery is at least once with no ordering guarantee: deduplicate on `event.id`, and answer
2xx to event types you do not handle. Event types are generated from the schemas published at
`https://base44.com/webhooks/schemas`; run `npm run generate:webhooks` to refresh them.

## Sessions

`/api/builder-socket-session` is your backend's route, not an SDK endpoint. It opens a
socket session with its workspace key (`apps:watch` scope) through
`POST /api/service/socket-sessions` with `{ app_ids }`, and returns the response body
to the browser. `getSession` returns that body unchanged: the SDK reads `session_token`,
`socket_url` and `socket_path` and ignores other keys such as `session_id` and
`expires_in`. Never pass the workspace key or any other server credential to this client. Subscribe only to apps on the session's allowlist; your
backend adds or removes apps with `PUT`/`DELETE /api/service/socket-sessions/{session_id}/rooms/{app_id}`.

A session lasts one hour and is never extended. The token goes exclusively in
CONNECT `auth.session_token`, never a URL, and the SDK keeps it in memory only. It
is reused across automatic reconnects. `getSession` is called when a builder
session first connects, and again only when the server rejects the cached token or
expires the session; the SDK then reconnects once with the new session. If the new
session has a different `socket_url` or `socket_path`, the SDK closes the old socket,
opens one at the new address and rejoins every active subscription. Retrieval has a
twenty-second timeout. A failure, a timeout, or a session without a token, an
HTTP(S) origin as `socket_url` (no credentials, path, query or fragment) or an
absolute `socket_path` reports `session_unavailable`.

One live socket per session: a newer connection with the same token replaces the
older one, which stops with `session_replaced`. Open one session per page.

## Lifecycle

`createPlatformClient()` creates a lightweight module container: no Socket.IO
instance, timers, session request or network activity. It takes no options. Its
`builder` module follows the server SDK's module-factory pattern.

`client.builder.init({ getSession, onError })` synchronously creates an independent
`BuilderSession` without connecting or creating a socket. Repeated calls create separate sessions, each owning its own
socket, listeners, subscriptions and cleanup. Close the returned session when its
view is disposed; the root client and other sessions remain usable.

`builder.connect()` fetches the first session, creates the socket at its address and
resolves on CONNECT, before any snapshot. The socket uses the default namespace on the
session's `socket_path`, WebSocket only, with a dedicated manager.
Transport reconnection uses five attempts, starting at one second and capped at ten
seconds with jitter; each attempt has a twenty-second timeout. A temporary server
refusal is retried the same way. After exhaustion, a refusal or `session_replaced`,
fix the cause and call `builder.connect()`.

`builder.subscribe(appId, options)` returns a handle with `appId`, `active` and
idempotent `unsubscribe()`. App IDs are 24 lowercase hexadecimal characters. One
subscription per app and at most eight subscriptions are allowed per builder session.
Subscriptions can be created before connecting. `builder.close()` is terminal for that
session; call `client.builder.init(...)` again to start another.

## Snapshots and events

There is no replay cursor. Every join, including each rejoin after a reconnect, is
answered with a `Snapshot`: the app's current `status` and its last 50 public
messages. After a main-conversation rewrite (undo, restore, sync), the SDK delivers
`conversation.changed` and rejoins the room, so a fresh snapshot follows. Treat a
snapshot as the app's current state. The app's live events follow it, including
those that landed while it was read. It holds only the last 50 messages, so merge
by `id` if you keep longer history.

Delivery is serialized **per app**, snapshots included; a slow app does not block
others. Callbacks must settle; they cannot be forcibly cancelled. The client bounds
pending delivery to 1,000 items per app. Error observers are synchronous notifications;
their exceptions are isolated so they cannot interrupt another app's delivery.

## Public shapes

- `PlatformClient` (`client.types.ts`): the `builder` module.
- `BuilderModule` (`modules/builder.types.ts`): lazy `init(options)` factory.
- `BuilderInitOptions`: `getSession` and the connection-level `onError` observer.
- `SocketSession`: the `session_token`, `socket_url` and `socket_path` that `getSession` returns.
- `BuilderSession`: `connect()`, `subscribe(appId, options)`, `close()`.
- `SubscriptionOptions`: required `onSnapshot`, `onEvent` and `onError`.
- `PlatformSubscription`: read-only `appId`, `active`, and `unsubscribe()`.
- `PlatformEvent`, `PlatformEventMap`, `PlatformSnapshot`, `ToolCall`, `GuardApproval`
  (`modules/builder.events.types.ts`), derived from the generated event types.
- Error codes in `errors.types.ts`.

`PlatformEvent` is a **discriminated union**: switch on `event.type` to narrow
`event.data`. Each delivery contains `type`, `appId` and `data`. On the wire every
event is `{room, data}`; the SDK routes by `room` and validates the envelope, while
payload schemas and private-field filtering are the server's. Omitted keys mean
unchanged and explicit null clears. Events carrying `branch_id` belong to that branch;
null or absent is main. An event name the SDK doesn't know is forwarded as
`{type: "unknown", name, appId, data}` with only the envelope validated, so a new event reaches
partners when the service deploys it; new `room.*` notices are dropped. `PlatformSnapshot` is
the service's `Snapshot` plus the app's `room`. Structural filtering does not promise
redaction of generated prose or user content.

## Event types

The socket protocol is defined by the service's AsyncAPI document, committed as
`asyncapi.json`. `src/client/modules/builder.events.generated.ts` is generated from it with
`json-schema-to-typescript`: one type per schema, named after the backend model
(`Message`, `StatusObject`, `QueueState`, one `*Call` per tool, one `*Approval` per
guard), plus `ServerEventMap` and `ClientMessageMap`. Never edit it by hand.

To pick up a protocol change:

```sh
# Production serves only beta and GA events, so point at a dev backend while events are alpha.
npm run sync:asyncapi -w @base44/platform -- http://localhost:8000/api/asyncapi.json
npm run gen:events -w @base44/platform
```

`sync:asyncapi` also reads `ASYNCAPI_URL`, defaults to production, and refuses a
document with no messages. CI runs `npm run check:events` and fails when the
generated file differs from what `asyncapi.json` produces.

## Reference docs

Every exported shape and field has JSDoc. `npm run docs` validates it into `docs`.
`npm run create-docs` runs the app SDK's TypeDoc and Mintlify pipeline for this package,
and `npm run copy-docs-local -- --target <mintlify-docs>` copies the result into
`developers/references/platform-sdk/docs`. The pipeline's config for this package lives
in `scripts/mintlify-post-processing/`, including `reference.ts`, the docs-only entry that combines
the client and server entrypoints into one reference. The Socket messages page is built in mintlify-docs from
the service's AsyncAPI document, not here.

`PlatformSocketError` extends `Error` with `code` and optional `appId`. Original
exceptions, payloads and credentials are never attached.

| Error code | Action |
| --- | --- |
| `connection_denied` | The session was rejected even with a fresh token: the workspace, key or session is not usable. |
| `session_unavailable` | `getSession` failed, timed out or returned an invalid session; no provider details are forwarded. |
| `session_replaced` | Another connection with the same session took over. Stop, or open a new session. |
| `connection_failed` | Transport failure or exhausted retries; call `connect()` after fixing connectivity. |
| `access_denied` | The join was refused: the app is not on the session's allowlist, or joins were rate limited. |
| `access_revoked` | The app left the session's allowlist; do not resubscribe. |
| `snapshot_unavailable` | Joined, but the snapshot failed. Live events still flow; the subscription stays active. |
| `subscription_limit` | Release a subscription before adding another. |
| `delivery_overflow` | 1,000 deliveries queued for the app; subscribe again for a fresh snapshot. |
| `protocol_error` | Invalid routing or envelope. Stop and investigate. |
| `handler_failed` | An application callback failed; fix it and subscribe again. |
| `client_closed` | The builder session was explicitly closed; initialize another session. |

No SDK dependency, package version or lockfile changes are required. Socket.IO
remains the existing SDK dependency. Chat commands and HTTP APIs are outside this entry point.
