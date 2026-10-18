# Changelog

## Unreleased

**Breaking.** Base44 calls it the AI chat, so the client and the webhook events say `chat`, not
`builder`.

### Client

| Before | After |
| --- | --- |
| `client.builder` | `client.chat` |
| `BuilderModule` | `ChatModule` |
| `BuilderSession` | `ChatSession` |
| `BuilderInitOptions` | `ChatInitOptions` |

```ts
const chat = client.chat.init({ getSession, onError });
```

### Webhooks

`chat.turn_started.v1` and `chat.turn_ended.v1` replace `builder.turn_started.v1` and
`builder.turn_ended.v1`, with the same payloads. Their types are `ChatTurnStartedV1Data` and
`ChatTurnEndedV1Data`. Base44 still sends the old names to endpoints that selected them; this SDK
reports those as `UnknownWebhookEvent`. Select `chat.turn_*` on your endpoint to move.

## 0.2.0

**Breaking.** The client, its options and the event type names change, and events the SDK doesn't
know now reach `onEvent`. A server entrypoint, `@base44/platform/server`, is new.

### Client and session

- `new Base44PlatformClient(options)` is replaced by `createPlatformClient()`, which takes no
  options. `serverUrl`, `getSessionToken` and the `PlatformClientOptions` type are removed.
- `builder.init()` takes `getSession`, which returns the body your server received from
  `POST /api/service/socket-sessions`, unchanged. The SDK reads `session_token`, `socket_url` and
  `socket_path`, and ignores other keys.
- The socket connects on the session's `socket_path` instead of a hard-coded `/ws/socket.io/`, and
  is created on the first `connect()`. When a renewed session has a different address, the SDK
  moves the socket and rejoins every active subscription.
- An invalid `session_token`, `socket_url` or `socket_path` rejects `connect()` with
  `session_unavailable` instead of throwing a `TypeError`.

Before:

```ts
const client = new Base44PlatformClient({
  serverUrl,
  getSessionToken: async () => (await fetchSession()).session_token,
});
const builder = client.builder.init({ onError });
```

After:

```ts
const client = createPlatformClient();
const builder = client.builder.init({ getSession: fetchSession, onError });
```

### Server entrypoint

- New: `@base44/platform/server` exports `createPlatformServer({ serverUrl, apiKey })` for your
  server, authenticated with a workspace API key. It has no modules yet. Keep the key on your
  server; the browser client never takes it.
- The browser client moves to `dist/client/`. Import paths don't change: `@base44/platform` is
  still the client.

### Event types

The event types are generated from the service's AsyncAPI document and take the backend's model
names.

| 0.1.0 | 0.2.0 |
| --- | --- |
| `ChatMessage` | `Message` |
| `AppStatus` | `StatusObject` |
| `Snapshot` | `PlatformSnapshot` |
| `SnapshotQueue` | `QueueState` |
| `ToolGuardApproval` | `GuardApproval`, a union of one `*Approval` per guard |
| `ToolMediaResult` | `ImageResult` |
| `ToolQuestionArguments`, `ToolQuestion`, `ToolQuestionOption` | `QuestionArguments`, `Question`, `QuestionOption` |
| `ToolQuestionInput`, `ToolQuestionAnswer` | `QuestionInput`, `QuestionAnswer` |
| `ToolSecretArguments`, `ToolSecretField` | `SetSecretsArguments`, `SecretField` |
| `ToolPackageArguments`, `ToolPackageOperation` | `InstallPackageArguments`, `PackageOperation` |
| `ToolPlanArguments`, `ToolPlanUpdate` | `UpdatePlanArguments`, `PlanUpdate` |
| `ToolPrdArguments` | `PrdArguments` |
| `ToolMediaArguments` | `MediaArguments` |
| `ToolEntityMutationArguments` | `EntityChangeArguments` |

- `ToolCall` is a union of one `*Call` per tool, such as `AskClarifyingQuestionsCall` and
  `WriteFileCall`. Check `name` to narrow it to that tool's `arguments` and `display`.
  `ToolArguments` and `ToolDisplay` are removed.
- `BranchScoped` is removed. Each payload that belongs to a branch has its own `branch_id`.
- `PlatformEvent` gains a member for events newer than the SDK: `{ type: "unknown", name, appId,
  data }`, where `data` is `Record<string, unknown>`. Before, the SDK dropped them. A `switch` on
  `event.type` that must cover every case needs a `case "unknown"`.
- New: `SessionErrorCode` and `AppErrorCode` split `PlatformSocketErrorCode`, and every schema in
  the protocol is exported, with `ServerEventMap` and `ClientMessageMap`.

## 0.1.0

First release.
