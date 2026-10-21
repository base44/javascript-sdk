# @base44/platform

```sh
npm install @base44/platform
```

The Platform SDK for white-label platforms built on Base44. It is independent of the app SDK
(`@base44/sdk`) and has three entrypoints:

- `@base44/platform`, for the browser: implements the read-only white-label live AI chat
  contract. A partner's browser watches the AI chat of up to eight apps over the platform's
  shared socket. The workspace must have white-label sockets enabled; this SDK does not open sessions.
- `@base44/platform/react`: `useChat`, a hook that runs the AI chat for one app on top of the
  browser client. See [React](#react).
- `@base44/platform/server`, for your backend: verify the webhooks Base44 sends when apps are
  created, published, unpublished, trashed or restored. See
  [Receiving webhooks](#receiving-webhooks-server).

```ts
import { createPlatformClient } from "@base44/platform";

const client = createPlatformClient();
const chat = client.chat.init({
  // Returns the body of POST /api/v1/socket-sessions, unchanged.
  async getSession() {
    const response = await fetch("/api/chat-socket-session", { method: "POST" });
    if (!response.ok) throw new Error("Session request failed");
    return response.json();
  },
  onError(error) { showConnectionError(error.code); },
});
const subscription = chat.subscribe(appId, {
  onSnapshot(snapshot) { replaceAppState(snapshot); },
  async onEvent(event) { await applyEvent(event); }, // awaited before the next event
  onError(error) { showSubscriptionError(error.code); },
});
await chat.connect();
// On view teardown:
subscription.unsubscribe();
chat.close();
```

## Receiving webhooks (server)

`@base44/platform/server` verifies Base44 outbound webhooks and answers the endpoint
activation challenge. It uses WebCrypto only (Node 20+, Deno, Bun, Workers, edge runtimes) and
makes no network calls: pass your workspace's public keys (`whpk_…`) to each call that verifies.

The simplest route is `createHandler`. It reads the raw body, verifies it, answers the
activation challenge and picks the status code: 400 for a delivery that fails verification,
500 when your keys are misconfigured, the body can't be read or a callback throws, and 204
otherwise, including for event types you have no handler for. Base44 retries any answer that
isn't 2xx; the status only shows in its delivery log which side failed.

```ts
import { createPlatformServer } from "@base44/platform/server";

const platform = createPlatformServer();
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
    throw error; // missing/malformed keys: a 500. Base44 retries any non-2xx answer
  }
  switch (event.type) {
    case "webhook.test.v1": return Response.json({ challenge: event.data.challenge }); // activates the endpoint
    case "app.deleted.v1": await forget(event.data.app_id); break;
  }
  return new Response(null, { status: 204 });
}
```

An event type added to Base44 after your SDK version arrives as `{ type: "unknown", name, data }`,
with its real type in `name` and an unchecked `data`, the same shape the client uses. After you
upgrade, it arrives under its own `type`.

Delivery is at least once with no ordering guarantee: deduplicate on `event.id`, and answer
2xx to event types you do not handle. Event types are generated from the schemas published at
`https://base44.com/webhooks/schemas`; run `npm run generate:webhooks` to refresh them.

## Sessions

`/api/chat-socket-session` is your backend's route, not an SDK endpoint. It opens a
socket session through `POST /api/v1/socket-sessions` with `{ app_ids }`, and returns the
response body to the browser. It authenticates as `Authorization: Bearer` with either a
personal access token, which can watch the apps its owner can edit in its workspace, or a
workspace API key with the `apps:watch` scope. The workspace needs the Builder plan or higher. `getSession` returns that body unchanged: the SDK reads `session_token`,
`socket_url` and `socket_path` and ignores other keys such as `session_id` and
`expires_in`. Never pass the token, the workspace key or any other server credential to this client. Subscribe only to apps on the session's allowlist; your
backend adds or removes apps with `PUT`/`DELETE /api/v1/socket-sessions/{session_id}/apps/{app_id}`.

A session lasts one hour and is never extended. The token goes exclusively in
CONNECT `auth.session_token`, never a URL, and the SDK keeps it in memory only. It
is reused across automatic reconnects. `getSession` is called when a chat
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
`chat` module follows the server SDK's module-factory pattern.

`client.chat.init({ getSession, onError })` synchronously creates an independent
`ChatSession` without connecting or creating a socket. Repeated calls create separate sessions, each owning its own
socket, listeners, subscriptions and cleanup. Close the returned session when its
view is disposed; the root client and other sessions remain usable.

`chat.connect()` fetches the first session, creates the socket at its address and
resolves on CONNECT, before any snapshot. The socket uses the default namespace on the
session's `socket_path`, WebSocket only, with a dedicated manager.
Transport reconnection uses five attempts, starting at one second and capped at ten
seconds with jitter; each attempt has a twenty-second timeout. A temporary server
refusal is retried the same way. After exhaustion, a refusal or `session_replaced`,
fix the cause and call `chat.connect()`.

`chat.subscribe(appId, options)` returns a handle with `appId`, `active` and
idempotent `unsubscribe()`. App IDs are 24 lowercase hexadecimal characters. One
subscription per app and at most eight subscriptions are allowed per session.
Subscriptions can be created before connecting. `chat.close()` is terminal for that
session; call `client.chat.init(...)` again to start another.

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

- `PlatformClient` (`client.types.ts`): the `chat` module.
- `ChatModule` (`modules/chat.types.ts`): lazy `init(options)` factory.
- `ChatInitOptions`: `getSession` and the connection-level `onError` observer.
- `SocketSession`: the `session_token`, `socket_url` and `socket_path` that `getSession` returns.
- `ChatSession`: `connect()`, `subscribe(appId, options)`, `close()`.
- `SubscriptionOptions`: required `onSnapshot`, `onEvent` and `onError`.
- `PlatformSubscription`: read-only `appId`, `active`, and `unsubscribe()`.
- `PlatformEvent`, `PlatformEventMap`, `PlatformSnapshot`, `ToolCall`, `GuardApproval`
  (`modules/chat.events.types.ts`), derived from the generated event types.
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
`asyncapi.json`. `src/client/modules/chat.events.generated.ts` is generated from it with
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
the client, server and React entrypoints into one reference. The Socket messages page is built in mintlify-docs from
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
| `client_closed` | The session was explicitly closed; initialize another session. |

No SDK dependency, package version or lockfile changes are required. Socket.IO
remains the existing SDK dependency. Chat commands and HTTP APIs are outside this entry point.

## React

`@base44/platform/react` adds one hook, `useChat`, that runs the AI chat for one
app on top of this client: it opens the live session and renews it, turns messages into items
made for rendering, binds every question the AI asks to the step it belongs to. It renders nothing. React is an optional peer dependency, loaded only by this
entry; the root entry stays framework-free.

```tsx
import { useChat } from "@base44/platform/react";

const chat = useChat({ appId, backend, onAppCreated });
chat.items.map((item) =>
  item.steps.map((step) => step.question?.kind === "approval" && <button onClick={step.question.approve}>Allow</button>),
);
```

`backend` is four functions your backend provides, in any language behind them: `createApp`,
`openLiveSession`, `sendMessage` and `submitToolCallInput`, each wrapping one Base44 REST
call with your credentials, so the browser never holds a key. The hook returns `items`, a
`status` (`ready`, `submitted`, `building`, `waiting`, `error`), a `connection` (`connecting`,
`connected`, `disconnected`), an `error`, and the actions `send`, `create` and `clearError`. `send` needs an app; `create` makes
the first, and the chat watches it while `appId` is `null`. A sent prompt shows at once as a
`pending` item until Base44's own message arrives; a prompt sent mid-build waits in Base44's
queue meanwhile. A question is a union on `kind` (`choice`, `secrets`, `approval`) and carries only the
actions its kind allows, and declining is always one of them. As in Base44's app editor, only the
last assistant message makes the chat wait; a kind this release doesn't know is declined for you. Every shape has JSDoc in `src/react/chat.types.ts`.
