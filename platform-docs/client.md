# Platform browser client

This entry point implements the read-only white-label builder socket contract.
It is independent of the runtime SDK and the proposed platform/server entry point.
The backend browser-token integration and workspace rollout are prerequisites;
this SDK does not mint tokens or make an unavailable endpoint usable.

```ts
import { Base44PlatformClient } from "@base44/sdk/platform/client";

const client = new Base44PlatformClient({
  serverUrl: "https://base44.app",
  async getToken() {
    const response = await fetch("/api/platform/browser-token", { method: "POST" });
    if (!response.ok) throw new Error("Token request failed");
    return (await response.json()).token;
  },
  onError(error) { showConnectionError(error.code); },
});
const subscription = client.subscribe(appId, {
  afterSeq: savedState?.cursor,
  async onEvent(event) {
    // Apply all five event types in this handler. It is awaited before the next event.
    await applyAndPersistEvent(event); // persist state and event.seq together
  },
  async onJoined(boundary) {
    await persistBoundaryWithCurrentState(boundary.seq);
  },
  onError(error) { showSubscriptionError(error.code); },
});
await client.connect();
// On view teardown:
subscription.unsubscribe();
client.close();
```

The `/api/platform/browser-token` route is your backend's route, not an SDK endpoint.
Only browser-authorized tokens belong here. Never pass an API key or an elevated
server credential. Tokens go exclusively in CONNECT `auth.token`, never URL/query
parameters or browser persistence managed by this SDK. `getToken` is called on
every connection attempt, including automatic reconnects. Token retrieval has a
twenty-second timeout and reports `token_unavailable` on failure.

## Lifecycle and replay

Construction opens no connection. `connect()` resolves on namespace CONNECT;
`onJoined` reports completion of each app's replay. Socket.IO uses `/partner`,
`/ws-whitelabel/socket.io/`, WebSocket only and a dedicated manager. Transport
reconnection uses five attempts, starting at one second and capped at ten seconds
with Socket.IO jitter; each connection attempt has a twenty-second timeout.
After exhaustion or a server/auth rejection, fix the cause and call `connect()`.

`subscribe(appId, options)` returns a handle with `appId`, `active`, `cursor`, and
idempotent `unsubscribe()`. App IDs are 24 lowercase hexadecimal characters. One
subscription per app and at most eight subscriptions are allowed on a client.
Subscriptions can be created before connecting. `close()` is terminal and stops
reconnects, subscriptions and listeners; create a new client to start again.

Delivery is serialized **per app**, including replay and `onJoined`; a slow app
does not block others. On reconnect the next join waits for queued application
work, then sends the last successfully applied cursor as `after_seq`. Cursors are
opaque and app-specific. The SDK does not parse or compare their ordering. An
immediately repeated cursor is ignored; handlers must still tolerate redelivery
across process restarts and uncertain persistence. This is not exactly-once delivery.
Persist the cursor atomically with the state it describes inside your callbacks;
the handle's cursor advances only after a callback succeeds. Do not persist a
cursor in a separate state store before applying the corresponding event.

A fresh join starts at the acknowledged live boundary and supplies **no initial
snapshot**. Initial history and recovery beyond retention belong to your backend.
Replay retains up to 2,000 events per app and expires after 3,600 seconds of
inactivity; the `Joined` acknowledgement reports these server values. The client
bounds pending delivery to 1,000 items; overflow stops the subscription explicitly.
Existing branch metadata passes through; subscriptions cover the regular app room.

On a subscription error, `active` becomes false, delivery stops and the last applied
cursor is retained. No automatic fresh join discards missed history. For
`stream_unavailable`, unsubscribe/re-subscribe with that cursor using bounded
application backoff. For `resync_required`, reconcile state/history through your
backend, then subscribe without `afterSeq`. Coordinate snapshot/recovery with your
backend: a fresh boundary alone cannot close a race between fetching a snapshot
and starting a live subscription. HTTP writes also belong to your partner backend.

Callbacks must settle; they cannot be forcibly cancelled. Unsubscribe/close prevents
queued callbacks and later cursor advancement, but a callback already running may
finish its own side effects. Error observers are synchronous notifications; their
exceptions are isolated so they cannot interrupt another app's delivery.

## Public shapes

Every exported shape and field has JSDoc. Run `npm run docs:platform-client` for
validated reference pages in `docs/platform/client`. `PlatformEvent` is a
**discriminated union**: switch on `event.type` to narrow `event.data`. Each delivery
contains `type`, `appId`, opaque `seq`, and decoded `data`. JSON strings are decoded
for `update_model`, `task_update` and `image_ready`. The two flat wire payloads keep
their original fields, excluding `seq`, which is available on the delivery itself.
The SDK validates routing/envelopes; payload schema validation and private-field
filtering are the server's responsibility. Unknown event names are not forwarded.

| Event | Data contract |
| --- | --- |
| `update_model` | `AppUpdate`: optional `status`, `_last_msg`, `_last_msg_conversation_id`, `_scope_branch_id`, `sandbox_should_reload`, `navigate_preview_to`, `navigate_preview_force_to`. Omission means unchanged; null means clear. `_last_msg` replaces by message ID. |
| `directive` | `Directive`: `room`, `type` (`conversation_changed` or `app_files_changed`), optional `branch_id`. No raw directive payload. |
| `queue_update` | `QueueUpdate`: `app_id`, `items`, `is_paused`, optional `branch_id` and `processed_item_id`. Replaces the entire queue. |
| `task_update` | `TaskUpdate`: `event_type` (`task_started`, `task_progress`, `task_completed`, `task_failed`, `task_cancelled`), optional `tool_call_id`, `message_id`, `branch_id`, numeric `progress`. |
| `image_ready` | `ImageReady`: `placeholder_url`, `status` (`pending`, `completed`, `failed`), optional nullable `image_url`. |

`ChatMessage` has optional `id`, `role` (`user`/`assistant`), text/null `content`,
`file_urls`, `tool_calls`, timestamp-only `metadata.created_date`, and `checkpoint_id`.
`ToolCall` has optional `id`, `name`, `status`, `requires_user_input`, and the existing
nested `waiting_on.kind` (`approval`/`choice`/`input`/null). `status` is `running`,
`success`, `error`, `stopped`, or `waiting_for_user_input`. No raw tool arguments,
results, or interaction forms are exposed. `AppUpdate.status` contains optional
`state` (`ready`/`processing`/`error`) and nullable `last_updated_date`.
`QueueItem` contains `id`, `content`, `created_at`, optional nullable `file_urls` and
`branch_id`. Numeric progress fields are optional nullable `current`, `total`,
`percentage`. Branch identifiers are strings or null. Dates remain wire strings.
Structural filtering does not promise redaction of generated prose or user content.

`Joined` contains `room`, `seq`, `max_entries`, `inactivity_expiry_seconds`. It is an
ordered server event, not a Socket.IO callback acknowledgement.
`PlatformSocketError` extends `Error` with `code` and optional `appId`. Original
exceptions, payloads and credentials are never attached.

| Error code | Action |
| --- | --- |
| `invalid_room` | Correct the app/room; malformed local IDs are rejected synchronously. |
| `invalid_cursor` | Correct the saved cursor; do not retry it unchanged. |
| `access_denied`, `connection_denied` | Obtain an authorized browser credential/workspace configuration. |
| `subscription_limit` | Release a subscription before adding another. |
| `resync_required` | Reconcile through the backend before a fresh subscription. Includes client buffer overflow. |
| `stream_unavailable` | Retry with bounded backoff and the last applied cursor. |
| `connection_failed` | Transport failure or exhausted reconnect attempts; call `connect()` after fixing connectivity. |
| `token_unavailable` | Fix token retrieval; no provider exception details are forwarded. |
| `protocol_error` | Invalid routing/envelope/JSON. Stop and investigate; affected subscriptions retain their cursor. |
| `handler_failed` | Application callback failed; fix state application before resuming from the saved cursor. |
| `client_closed` | The client was explicitly closed; create another client. |

No SDK dependency, package version or lockfile changes are required. Socket.IO
remains the existing SDK dependency. Chat commands and HTTP APIs are outside this entry point.
