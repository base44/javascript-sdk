# @base44/platform

```sh
npm install @base44/platform
```

This package implements the read-only white-label builder socket contract: a
partner's browser watches the builder chat of up to eight apps over the platform's
shared socket. It is independent of the app SDK (`@base44/sdk`).
The workspace must have white-label sockets enabled; this SDK does not open sessions.

```ts
import { Base44PlatformClient } from "@base44/platform";

const client = new Base44PlatformClient({
  serverUrl: socketUrl, // the session's socket_url, from POST /api/service/socket-sessions
  async getSessionToken() {
    const response = await fetch("/api/builder-socket-session", { method: "POST" });
    if (!response.ok) throw new Error("Session request failed");
    return (await response.json()).session_token;
  },
});
const builder = client.builder.init({
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

## Sessions

`/api/builder-socket-session` is your backend's route, not an SDK endpoint. It opens a
socket session with its workspace key (`apps:watch` scope) through
`POST /api/service/socket-sessions` with `{ app_ids }`, and returns only the
`session_token` and `socket_url` to the browser. Pass `socket_url` as `serverUrl`. Never pass the workspace key or any other server
credential to this client. Subscribe only to apps on the session's allowlist; your
backend adds or removes apps with `PUT`/`DELETE /api/service/socket-sessions/{session_id}/rooms/{app_id}`.

A session lasts one hour and is never extended. The token goes exclusively in
CONNECT `auth.session_token`, never a URL, and the SDK keeps it in memory only. It
is reused across automatic reconnects. `getSessionToken` is called when a builder
session first connects, and again only when the server rejects the cached token or
expires the session; the SDK then reconnects once with the new token. Retrieval has
a twenty-second timeout and reports `session_unavailable` on failure.

One live socket per session: a newer connection with the same token replaces the
older one, which stops with `session_replaced`. Open one session per page.

## Lifecycle

`new Base44PlatformClient({ serverUrl, getSessionToken })` creates a lightweight module
container: no Socket.IO instance, timers, token request or network activity. Its
`builder` module follows the server SDK's module-factory pattern.

`client.builder.init({ onError })` synchronously creates an independent `BuilderSession`
without connecting. Repeated calls create separate sessions, each owning its own
socket, listeners, subscriptions and cleanup. Close the returned session when its
view is disposed; the root client and other sessions remain usable.

`builder.connect()` resolves on CONNECT, before any snapshot. The socket uses the
default namespace on `/ws/socket.io/`, WebSocket only, with a dedicated manager.
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

- `PlatformClientOptions` (`client.types.ts`): `serverUrl`, `getSessionToken`.
- `BuilderModule` (`modules/builder.types.ts`): lazy `init(options)` factory.
- `BuilderInitOptions`: connection-level `onError` observer.
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
null or absent is main. Unknown event names are not forwarded. `PlatformSnapshot` is
the service's `Snapshot` plus the app's `room`. Structural filtering does not promise
redaction of generated prose or user content.

## Event types

The socket protocol is defined by the service's AsyncAPI document, committed as
`asyncapi.json`. `src/modules/builder.events.generated.ts` is generated from it with
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
in `scripts/mintlify-post-processing/`.

`PlatformSocketError` extends `Error` with `code` and optional `appId`. Original
exceptions, payloads and credentials are never attached.

| Error code | Action |
| --- | --- |
| `connection_denied` | The session was rejected even with a fresh token: the workspace, key or session is not usable. |
| `session_unavailable` | `getSessionToken` failed or timed out; no provider details are forwarded. |
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
