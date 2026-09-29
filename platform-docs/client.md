# Platform browser client

This entry point implements the read-only white-label builder socket contract: a
partner's browser watches the builder chat of up to eight apps over the platform's
shared socket. It is independent of the runtime SDK and the platform/server entry point.
The workspace must have white-label sockets enabled; this SDK does not open sessions.

```ts
import { Base44PlatformClient } from "@base44/sdk/platform/client";

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
messages. A main-conversation rewrite (undo, restore, sync) also sends one, right after
its `conversation_changed` directive. Treat a snapshot as the app's current state.
Live events can arrive just before it; merge its messages by `id` rather than
discarding newer ones.

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

Every exported shape and field has JSDoc. Run `npm run docs:platform-client` for
validated reference pages in `docs/platform/client`. `PlatformEvent` is a
**discriminated union**: switch on `event.type` to narrow `event.data`. Each delivery
contains `type`, `appId` and decoded `data`. JSON strings are decoded for
`update_model`, `task_update` and `image_ready`; the flat payloads keep their fields.
The SDK validates routing/envelopes; payload schema validation and private-field
filtering are the server's responsibility. Unknown event names are not forwarded.

| Event | Data contract |
| --- | --- |
| `update_model` | `AppUpdate`: optional `status`, `_last_msg`, `_last_msg_conversation_id`, `_scope_branch_id`, `sandbox_should_reload`, `navigate_preview_to`, `navigate_preview_force_to`. Omission means unchanged; null means clear. `_last_msg` replaces by message ID; `DeletedMessage` (`{id, is_deleted: true}`) removes it. |
| `directive` | `Directive`: `room`, `type` (`conversation_changed`, `app_files_changed`, `branch_deleted`, `imported_git_changed`, `imported_pull_request_changed`), optional `branch_id`. A re-read signal with no payload. |
| `queue_update` | `QueueUpdate`: `room`, `app_id`, `items`, `is_paused`, optional `branch_id` and `processed_item_id`. Replaces the entire queue. |
| `task_update` | `TaskUpdate`: `event_type` (`task_started`, `task_progress`, `task_completed`, `task_failed`, `task_cancelled`), optional `tool_call_id`, `message_id`, `branch_id`, numeric `progress`. |
| `image_ready` | `ImageReady`: `placeholder_url`, `status` (`pending`, `completed`, `failed`), optional nullable `image_url`. |

`ChatMessage` has optional `id`, `role` (`user`/`assistant`), text/null `content`,
`tool_calls`, timestamp-only `metadata.created_date`, `checkpoint_id`, and scalar
`additional_message_params` (`client_creation_id`, `plan_mode`, `plan_approved`,
`skip_ai_response`, `system_message_type`). `ToolCall` has optional `id`, `name`,
`status`, `requires_user_input`, `auto_approved`, `mutation_applied`, and the existing
nested `waiting_on.kind` (`approval`/`choice`/`input`/null). Its optional reviewed
extensions are:

| Field | Exact public contract |
| --- | --- |
| `display_projection` | File activity has `file_paths` and optional `content_empty`; execution activity has optional `summary` and `writes_entities`; entity activity has optional `entity_name` and `record_count`. |
| `arguments_string` | JSON for one of `ToolQuestionArguments`, `ToolSecretArguments`, `ToolPackageArguments`, `ToolPlanArguments`, `ToolPrdArguments` (`generate_prd`, the plan in plan mode) or `ToolMediaArguments`. It is absent for all other tools. |
| `user_input` | `ToolQuestionInput` only, for clarifying-question answers. Secret-form values are never exposed. |
| `results` | A fixed `ToolOutcome` success string, a `ToolMediaResult`, or, while a call waits for approval, a safety guard's `ToolGuardApproval` (`guard`, `reason`, reviewed `details`; shell-command approvals carry only `guard`). |

In plan mode the message `content` beside a `generate_prd` call can be empty; render the
plan from its arguments. Approving a plan, answering a question and approving a
guarded call are HTTP actions of your backend. `Snapshot` contains `room`, `status`
(`AppStatus`: optional `state` of `ready`/`processing`/`error` and nullable
`last_updated_date`) and `messages`. Dates remain wire strings. Structural filtering
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
| `protocol_error` | Invalid routing, envelope or JSON. Stop and investigate. |
| `handler_failed` | An application callback failed; fix it and subscribe again. |
| `client_closed` | The builder session was explicitly closed; initialize another session. |

No SDK dependency, package version or lockfile changes are required. Socket.IO
remains the existing SDK dependency. Chat commands and HTTP APIs are outside this entry point.
