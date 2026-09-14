# Token storage and lifecycle

## Defaults

`tokenStore` is optional. Every client gets its own `InMemoryTokenStore` by default.
Reuse the client within a process to share cached credentials. `asUser()` is cheap;
it does not create another store. Separate users, workspaces and platform URLs have
separate records. Restarting a process loses its cache. Serverless instances do not
share it and may each mint a token for the same user.

The SDK lazily calls `POST /api/service/user-tokens` with the configured workspace
key and `{ service_external_id }`. It never provisions during acquisition. A missing
principal remains an error; onboarding must explicitly call `users.provision()`.

Tokens are re-minted near expiry, without OAuth refresh-token rotation. The renewal
window is five minutes or half the issued lifetime, whichever is smaller. Concurrent
acquisitions and forced renewals for a user share a mint within one client. The
mint HTTP timeout is the client's ordinary `timeoutMs`; per-app request overrides
do not change it. Cancellation of one caller does not cancel another's shared mint.

No background process renews tokens. They are acquired on demand. Transient mint
failures do not erase stored credentials, but the requesting operation fails rather
than proceeding with credentials it was trying to renew.

## TokenKey

Every storage operation receives this object. Adapters must include all fields in
their storage namespace, not just the external ID.

| Field | Type | Meaning |
|---|---|---|
| `serverUrl` | `string` | Normalized configured base URL, without trailing slash. |
| `workspaceId` | `string` | Configured Base44 workspace ID. |
| `externalId` | `string` | Trimmed, lowercased ID from the integrator's system. |

Use a collision-free encoding such as `JSON.stringify([serverUrl, workspaceId,
externalId])`. Don't concatenate with an ambiguous separator.

## TokenRecord

These records are server secrets. Encrypt/protect them using your storage system's
credential controls. Never return them to a browser, analytics system or log.

| Field | Type | Meaning |
|---|---|---|
| `accessToken` | `string` | Opaque REST-capable service-user bearer credential. |
| `refreshToken` | `string \| null` | Refresh credential used only when revoking; null when absent. |
| `expiresAt` | `number` | Access expiry in **Unix epoch milliseconds**, not seconds. |
| `renewAt` | optional `number` | Epoch milliseconds at which to re-mint. SDK-produced records contain this. If missing, renew at expiresAt; useful for adapting older records. |

Expiry determines whether a credential can be reused; storage may retain expired
records so refresh credentials remain available for revocation. The memory store
returns copies and does not expose its underlying map.

## TokenStore and InMemoryTokenStore

| Operation | Signature | Contract |
|---|---|---|
| Read | `get(key: TokenKey): Promise<TokenRecord \| null>` | Return a complete record, or null for a miss. |
| Write | `set(key: TokenKey, record: TokenRecord): Promise<void>` | Atomically replace the record and resolve after persistence succeeds. |
| Clear | `delete(key: TokenKey): Promise<void>` | Remove credentials, not the provisioned user; missing is a no-op. |

`new InMemoryTokenStore()` implements these operations with process-local copies.
Supplying one explicitly allows multiple clients to share its records, but not their
acquisition locks. A persistent store similarly shares records across processes,
not a distributed lock. Duplicate mints across processes are possible in v1; take
this into account when sizing for the workspace's mint rate limits.

Any adapter exception becomes a sanitized `token_store_error`. A failed write does
not yield the newly minted token to the caller. The remote mint may already have
succeeded. Storage calls have no SDK-imposed timeout: an adapter should bound its own
I/O. Do not call back into token acquisition from an adapter method.

## Disconnect versus offboard

- `user.revokeToken()` revokes the stored refresh token via `POST /oauth/revoke`
  without sending the API key. It clears storage even if remote revocation fails,
  and reports the failure. It neither deletes the principal nor invalidates an
  already issued access JWT immediately. A subsequent SDK call may mint again.
- `users.deprovision(externalId)` removes the service identity, then clears storage.
  Server grant checks reject subsequent uses of its old tokens. Apps may transfer
  to the workspace owner. It is an explicit offboarding operation, not a toggle.
- Your own server must prevent offboarded customers from invoking onboarding again.
  This SDK deliberately uses one provision-and-mint-capable key and does not make
  that product policy decision for you.

Within one client, acquisition, revoke, provision and deprovision are serialized per
external ID so an earlier mint cannot repopulate storage after a completed revoke.
There is no distributed serialization across processes.

See [the compilable adapter example](../examples/platform-server.ts). No Prisma, Next.js or
other framework-specific storage code belongs inside the SDK.
