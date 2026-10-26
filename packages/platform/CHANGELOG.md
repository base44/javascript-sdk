# Changelog

## Unreleased

- **Breaking:** `ChatItem.createdAt` always ends in `Z`. If you added one yourself, remove it.
- `send()` and the answer actions resolve once Base44 has the prompt or answer. A backend failure
  after that, such as a server timeout mid-turn, no longer sets `error`, so your `ChatBackend`
  can simply forward the request.

## 0.5.0

The first release to build on. Versions 0.1.0 to 0.4.0 were previews and are deprecated on npm.
Coming from 0.4.0, only the React entry changed: `useBase44Chat`, `Base44Chat`,
`Base44ChatOptions`, `Base44ChatBackend` and `Base44App` are now `useChat`, `UseChatResult`,
`ChatOptions`, `ChatBackend` and `ChatApp`.

The package has three entry points:

- `@base44/platform`, for the browser: `createPlatformClient()` and its `chat` module follow the
  AI chat of up to eight apps over one read-only connection. `chat.init({ getSession, onError })`
  takes the body your server received from Create socket session, unchanged.
- `@base44/platform/react`: `useChat({ appId, backend, onAppCreated })` runs the whole AI chat for
  one app in your own UI. It returns a `UseChatResult` with the conversation as `ChatItem`s, its
  status, connection and error, and the actions `send`, `create` and `clearError`. Your
  `ChatBackend` makes the four Base44 calls, so no credential reaches the browser. React 18 or
  later is an optional peer, loaded only by this entry.
- `@base44/platform/server`, for your backend: `createPlatformServer()` and its `webhooks` module
  verify and handle the events Base44 sends.

```ts
import { useChat, type ChatBackend } from "@base44/platform/react";
```
