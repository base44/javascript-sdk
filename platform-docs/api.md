# API reference

Import all public platform values and types from `@base44/sdk/platform/server`.
The runtime SDK remains available from `@base44/sdk`.

Types carry the same field documentation in editors. Network operations return
promises; construction and `asUser()` are synchronous. No method starts a socket,
stream or background renewal timer. There is no root `apps` module.

## Base44PlatformClient and PlatformClientConfig

`new Base44PlatformClient(config)` creates a server-only client without network calls.

| Property | Type | Required / default | Meaning |
|---|---|---|---|
| `apiKey` | `string` | Required, nonempty | One workspace API key for provision/deprovision/mint. Needs `service_users:provision` and `user_tokens:mint`. |
| `workspaceId` | `string` | Required | Base44 workspace ID matching the key; not a user, app or folder ID. Sent on app calls. |
| `serverUrl` | `string` | `https://base44.app` | Trusted HTTP(S) base URL. Trailing slashes removed; credentials, query and fragment forbidden. Never derive from browser input. |
| `tokenStore` | `TokenStore` | New `InMemoryTokenStore` per client | Optional server persistence; see [storage](tokens.md). |
| `fetch` | `typeof globalThis.fetch` | `globalThis.fetch` | Fetch-compatible transport for server runtimes/testing. Must honor AbortSignal and redirect policy. |
| `timeoutMs` | `number` | `30000` | Positive finite milliseconds for ordinary HTTP calls and minting. |
| `buildTimeoutMs` | `number` | `120000` | Positive finite milliseconds for create/deploy HTTP calls. |

`client.users: UsersModule` exposes explicit workspace identity operations.
`client.asUser(externalId): PlatformUserClient` returns an immutable view; it makes no
request and does not change other views. IDs are trimmed/lowercased, matching the
provisioning API. Empty IDs and dot path segments are rejected. Keep your own mapping
stable; a different external ID names a different service identity.

### PlatformUserClient

| Member | Type | Contract |
|---|---|---|
| `externalId` | readonly `string` | Canonical ID from your system. |
| `apps` | readonly `AppsModule` | Operations authenticated as that service user. |
| `getAccessToken(options?)` | `Promise<string>` | Lazy server-only interoperability escape hatch. Returns an opaque credential, never a browser token. |
| `revokeToken()` | `Promise<void>` | Revoke the stored refresh token, then clear local credentials even on failure. Rejects on revocation/storage failure. Does not delete the service user or immediately invalidate access JWTs. |

### RequestOptions

Every users/apps method accepts an optional final `RequestOptions` argument.

| Field | Type | Default / behavior |
|---|---|---|
| `signal` | `AbortSignal` | Omitted: no caller cancellation. Cancellation aborts the HTTP request or stops this caller waiting for a shared mint. Shared minting may still complete. |
| `timeoutMs` | `number` | Method default above; positive finite milliseconds. Bounds that endpoint's HTTP operation, not preceding token acquisition or storage. |

### TokenRequestOptions

Used only by `getAccessToken(options?)`.

| Field | Type | Default / behavior |
|---|---|---|
| `signal` | `AbortSignal` | Optional cancellation of this caller's wait. |
| `forceRefresh` | `boolean` | `false`. If true, re-mint even when cached; concurrent forced calls in one client share renewal. Never implicitly provisions. |

## UsersModule

| Method | Endpoint | Input and result |
|---|---|---|
| `provision(input, options?)` | `POST /api/service/users` | `ProvisionUserInput` → `ProvisionedUser`. Idempotent within the workspace; explicit onboarding only. |
| `deprovision(externalId, options?)` | `DELETE /api/service/users/{externalId}` | Canonical external ID → `DeprovisionResult`. Missing principal/HTTP 404 returns `{ removed: false }`. |

Both use the configured API key; no user token is sent. The workspace comes from
the key. Provision does not mint a token, request an elevated role or adopt a human
account. A non-synthetic email in the response is rejected. Conflicts remain errors.
Deprovision can transfer owned apps to the workspace owner: use it for offboarding,
not a temporary disconnect. Storage clearing is serialized with acquisition in the client.

### ProvisionUserInput

| Field | Type | Required / behavior |
|---|---|---|
| `externalId` | `string` | Required stable ID from your system; canonicalized as above. Wire field `service_external_id`. |
| `displayName` | `string` | Optional label, visible to workspace administrators. Omitted leaves the server default. Wire field `display_name`. Avoid unnecessary personal information. |

### ProvisionedUser

Every field is present; none is nullable.

| Field | Type | Meaning |
|---|---|---|
| `externalId` | `string` | Canonical external ID returned by Base44. |
| `userId` | `string` | Base44-assigned service user ID, different from `externalId`. |
| `email` | `string` | Synthetic non-routable service identity address, not the customer's email. |
| `role` | `string` | Server-assigned workspace role. SDK requests no role override. |
| `created` | `boolean` | True if created now; false if returned from an existing provisioning. |

### DeprovisionResult

`{ removed: boolean }`: the `removed` field is true when removed by the server and false when already absent.
No credentials or raw account document are returned.

## AppsModule

All calls use the user's bearer token and the configured workspace. Resource IDs
(app/workspace/folder IDs) must be nonempty letters, digits, underscores or hyphens.
Authorization is still checked by Base44; possession of an ID grants no access.

| Method | Endpoint | Input / return / side effects |
|---|---|---|
| `list(input?, options?)` | `GET /api/apps` | `ListAppsInput` → `PlatformApp[]`. Newest-updated first, excludes agent apps, workspace listing mode. Bare array, no total count. |
| `create(input, options?)` | `POST /api/apps` | `CreateAppInput` → `PlatformApp`. Installs config/secrets and starts the initial build in one request. Does not file the app or record your product's ownership. |
| `get(appId, options?)` | `GET /api/apps/{appId}` | Projected `PlatformApp`. |
| `rename(appId, name, options?)` | `PUT /api/apps/{appId}` | Nonempty name, trimmed → projected `PlatformApp`. Updates name only. |
| `addToFolder(folderId, appIds, options?)` | `POST /api/app-folders/{folderId}/items` | Folder ID plus array of app IDs → `void`. Sends `app_ids`. Separate mutation, no transaction with create. |
| `getPreviewUrl(appId, options?)` | `GET /api/apps/{appId}/sandbox/preview-url` | `PreviewResult`. Can boot a sandbox. Always fetched anew. |
| `deploy(appId, options?)` | `POST /api/apps/{appId}/deploy` | Empty request body → `DeployResult`. Publishes the current main version; no checkpoint/branch selection in v1. |

No automatic mutation retries, including after HTTP 401. An error/timeout may leave
an accepted operation running. Inspect state before manually retrying a create or
deploy. Acquire fresh credentials explicitly after an authentication rejection.
HTTP 403/404 continue to indicate permission/missing-resource failures; 409 can mean
busy/conflict, 422 invalid input and 429 rate limiting. Errors retain HTTP status.

### ListAppsInput

| Field | Type | Default / meaning |
|---|---|---|
| `folderId` | `string` | Optional folder restriction. Omitted means no folder restriction. |
| `limit` | `number` | `20`; positive integer maximum result count. |
| `skip` | `number` | `0`; nonnegative integer offset. |

Results reflect Base44 permissions and the workspace listing mode, not an independent
per-customer filter. Your server must enforce its own ownership/visibility model.

### CreateAppInput

| Field | Type | Required / default / wire mapping |
|---|---|---|
| `prompt` | `string` | Required nonempty initial prompt. Sets `user_description` and `initial_message.content`. Creation can wait on build work. |
| `name` | `string` | Optional; server chooses if omitted. |
| `customInstructions` | `string` | Optional persisted instructions (`custom_instructions`) present before the first build. |
| `secrets` | `Record<string, string>` | Optional server-resolved names/values, transformed to `{ name: { type: "value", value } }`. Omitted means no supplied secrets. Never accept unrestricted secret values from the browser. |
| `publicSettings` | union below | Optional `public_settings`; omitted leaves Base44's default (currently `public_with_login`). Workspace policy/capabilities still apply. |
| `preventIframeEmbedding` | `boolean` | Optional `prevent_iframe_embedding`; omitted leaves the server default. Set false for an embedded preview. |

`publicSettings` values: `private_with_login` (restricted users, login required),
`public_with_login` (public, login required), `public_without_login` (public, login
not required), `workspace_with_login` (workspace access, login required).
The SDK does not silently make every new app public. Applications can explicitly
request `public_without_login` and permit embedding when appropriate for their product.

### PlatformApp and AppState

Every field below is always present. Optional upstream strings normalize to null.
Extra upstream properties are discarded, including source, identities, usage and
billing details. `AppState` is `ready | processing | error | unknown`.

| Field | Type | Meaning |
|---|---|---|
| `id` | `string` | Required Base44 app ID. |
| `name` | `string \| null` | Display name. |
| `slug` | `string \| null` | Public URL slug. |
| `state` | `AppState` | Build state. Missing/new upstream states map to `unknown`; no raw status details. |
| `updatedAt` | `string \| null` | ISO 8601 update timestamp. |
| `previewScreenshotUrl` | `string \| null` | Preview screenshot URL. |
| `logoUrl` | `string \| null` | App logo URL. |
| `lastDeployedAt` | `string \| null` | ISO 8601 last deployment timestamp. |
| `currentRevision` | `string \| null` | Current code revision; compare with deployedRevision. |
| `deployedRevision` | `string \| null` | Last deployed code revision. |
| `hasCustomInstructions` | `boolean` | Whether persisted instructions are nonempty. Their contents are not returned. |

### PreviewResult

| Field | Type | Meaning |
|---|---|---|
| `url` | `string` | Preview URL for unpublished changes, possibly containing credentials. |
| `token` | `string \| null` | Preview credential, or null if not needed. Not a platform API or subscription token. |

Treat both fields as sensitive. Request fresh access instead of caching; the current
preview credential has a five-minute lifetime, but no expiry field is promised here.
Only deliver it to a user authorized to see that preview. Internal sandbox metadata
is excluded.

### DeployResult

| Field | Type | Meaning |
|---|---|---|
| `appId` | `string` | App published by this request. |
| `checkpointId` | `string \| null` | Associated saved version, or null when none. |
| `revision` | `string` | Exact code revision deployed. |
| `deployedAt` | `string` | ISO 8601 deployment timestamp. |

## Base44PlatformError, PlatformErrorCode and PlatformErrorJSON

SDK errors extend `Error`. The constructor is
`new Base44PlatformError(code, message, status = 0)`; SDK-generated messages are safe,
fixed text, not raw server/adapter messages. Do not use this constructor to echo secrets.

| Field | Type | Meaning |
|---|---|---|
| `name` | `string` | `Base44PlatformError`. |
| `message` | `string` | SDK-defined explanation, without server response prose. |
| `status` | `number` | HTTP failure status; `0` for local/network/cancellation/storage failures. |
| `code` | `PlatformErrorCode` | Stable SDK category below. |

`toJSON(): PlatformErrorJSON` returns only `{ name, message, status, code }`, with
`name` typed as the literal `Base44PlatformError`. No headers, body, token, underlying
exception, stack or arbitrary server fields are retained in this representation.

| Code | Meaning |
|---|---|
| `invalid_argument` | Invalid documented input/configuration. |
| `server_only` | Client constructed in a browser environment. |
| `http_error` | Non-success HTTP response; inspect status. |
| `invalid_response` | Invalid JSON or required response fields/types missing. |
| `network_error` | Fetch failed, including refused redirects. No transport error is exposed. |
| `timeout` | HTTP deadline elapsed; server work may still complete. |
| `aborted` | Caller cancelled; server work may still complete. |
| `token_store_error` | Adapter failed to read/write/delete; original error is hidden. |

A store failure after a successful remote operation does not roll that operation back.
No retry loop is started for any of these errors.
