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
  serverUrl: "https://base44.app",
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
`session_token` to the browser. Never pass the workspace key or any other server
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
- Event/message models live in `modules/builder.events.types.ts`; error codes in `errors.types.ts`.

Every exported shape and field has JSDoc. Run `npm run docs` for
validated reference pages in `docs`. `PlatformEvent` is a
**discriminated union**: switch on `event.type` to narrow `event.data`. Each delivery
contains `type`, `appId` and `data`. On the wire every event is `{room, data}`; the SDK
routes by `room` and validates the envelope, while payload schemas and private-field
filtering are the server's. Omitted keys mean unchanged and explicit null clears.
Events carrying `branch_id` belong to that branch; null or absent is main. Unknown
event names are not forwarded.

| Event | Data contract |
| --- | --- |
| `message.updated` | `MessageUpdated`: the whole `message`, optional `conversation_id`. Replace the message with the same `id`. |
| `message.removed` | `MessageRemoved`: `message_id`, optional `conversation_id`. Sent when a message is deleted or hidden; an unknown ID is a no-op. |
| `app.status_changed` | `AppStatusChanged`: `status` (`AppStatus`), null clears it. |
| `preview.reload_requested` | Reload the app preview. |
| `preview.navigation_requested` | `PreviewNavigationRequested`: `path`, and `force` to navigate even when the user moved away. |
| `queue.updated` | `QueueUpdated`: `items`, `is_paused`, optional `processed_item_id`. Replaces the entire queue. |
| `task.progressed` | `TaskProgressed`: optional `tool_call_id`, `message_id`, `event_type`, numeric `progress`. |
| `image.resolved` | `ImageResolved`: `placeholder_url`, `status` (`pending`, `completed`, `failed`), nullable `image_url`. Replace the placeholder wherever it appears. |
| `conversation.changed` | The conversation was rewritten. On main, a fresh snapshot follows. |
| `files.changed`, `branch.deleted`, `repository.changed`, `pull_request.changed` | Re-read signals with no content. |

`ChatMessage` has optional `id`, `role` (`user`/`assistant`), text/null `content`,
`tool_calls`, timestamp-only `metadata.created_date`, `checkpoint_id`, and scalar
`additional_message_params` (`client_creation_id`, `plan_mode`, `plan_approved`,
`skip_ai_response`, `system_message_type`). `ToolCall` has optional `id`, `name`,
`status`, `requires_user_input`, `auto_approved`, `mutation_applied` and
`waiting_on.kind` (`approval`/`choice`/`input`). Each builder tool and guard declares
which of its parts are public; a tool with no declaration shows only these fields.

| Field | Public contract |
| --- | --- |
| `arguments` | One of `ToolQuestionArguments`, `ToolSecretArguments`, `ToolPackageArguments`, `ToolPlanArguments`, `ToolPrdArguments` (`generate_prd`, the plan in plan mode) or `ToolMediaArguments`, narrowed by the tool's `name`. Absent for other tools and partial streaming arguments. |
| `display` | File activity has `file_paths` and optional `content_empty`; execution activity has `summary` and `writes_entities`; entity activity has `entity_name` and `record_count`. |
| `user_input` | `ToolQuestionInput` only, for clarifying-question answers (`selected_label` for single-select, `selected_labels` for multi-select). Secret-form values are never exposed. |
| `results` | Once the call is not waiting on a guard: `ToolMediaResult` for image generation, or a URL string for game images and backgrounds (the placeholder `image.resolved` replaces) and videos (the finished video). |
| `approval` | While a call waits on a safety guard: `ToolGuardApproval` with `guard`, and `reason` and `details` where the guard declares them (shell-command approvals carry only `guard`). |

In plan mode the message `content` beside a `generate_prd` call can be empty; render the
plan from its arguments. Approving a plan, answering a question and approving a
guarded call are HTTP actions of your backend. `Snapshot` contains `room`, `status`
(`AppStatus`: optional `state` of `ready`/`processing`/`error`, nullable
`last_updated_date`, and nullable `turn_id`, the user message that started the turn),
`messages`, and `queue` (`SnapshotQueue`: the main branch's `items` and `is_paused`;
absent from older servers). Dates remain wire strings. Structural filtering
does not promise redaction of generated prose or user content.

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

## React

`@base44/platform/react` adds one hook, `useBase44Chat`, that runs a builder chat for one
app on top of this client: it opens the live session, turns messages into items made for
rendering, and binds every question the builder asks to the actions that answer it. It
renders nothing. React is an optional peer dependency, loaded only by this entry; the root
entry stays framework-free.

```tsx
import { useBase44Chat } from "@base44/platform/react";

const chat = useBase44Chat({ appId, server, onAppCreated });
chat.items.map((item) => item.question?.kind === "approval" && <button onClick={item.question.approve}>Allow</button>);
```

`server` is four functions your backend provides, in any language behind them: `createApp`,
`openLiveSession`, `sendMessage` and `submitToolCallInput`, each wrapping one Base44 REST
call with your credentials, so the browser never holds a key. The hook returns `items`,
a `phase` (`idle`, `creating`, `loading`, `waiting`, `building`), an `error`, `canSend`
(false while a question is open, because Base44 drops a message sent into a stopped turn),
and the actions `send`, `create` and `clearError`. A question is a union on `kind`
(`choice`, `input`, `approval`, `unknown`) and carries only the actions its kind allows;
declining is always one of them. Every shape has JSDoc in `src/react/chat.types.ts`, and
[`examples/react-chat.ts`](examples/react-chat.ts) shows a `fetch`-based `server`.
