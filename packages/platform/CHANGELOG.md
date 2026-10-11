# Changelog

## 0.2.0

**Breaking.** The browser passes one function instead of two values.

- `builder.init()` takes `getSession`, which returns the body your server received from
  `POST /api/service/socket-sessions`, unchanged. The SDK reads `session_token`, `socket_url` and
  `socket_path`, and ignores other keys.
- `createPlatformClient()` takes no options. `socketUrl` and `getSessionToken` are removed, along
  with the `PlatformClientOptions` type.
- The socket connects on the session's `socket_path` instead of a hard-coded `/ws/socket.io/`, and
  is created on the first `connect()`. When a renewed session has a different address, the SDK
  moves the socket and rejoins every active subscription.
- An invalid `session_token`, `socket_url` or `socket_path` rejects `connect()` with
  `session_unavailable` instead of throwing a `TypeError`.

Before:

```ts
const client = createPlatformClient({ socketUrl, getSessionToken: async () => (await fetchSession()).session_token });
const builder = client.builder.init({ onError });
```

After:

```ts
const client = createPlatformClient();
const builder = client.builder.init({ getSession: fetchSession, onError });
```

## 0.1.0

First release.
