# SDK HTTP tests

`npm test` runs the API type tests and hermetic unit suite. HTTP behavior tests call the real SDK Axios/fetch clients through one stateful MSW v2 mock Base44 platform. Tests never register handlers or author HTTP response bodies. Unexpected or unconfigured traffic fails teardown even when the SDK catches the request error.

## Write a platform-backed test

Arrange domain state with `platform.given`, act only through the SDK, then assert the returned behavior and any meaningful wire detail through `platform.requests`:

```ts
import { platform } from "./mocks/platform";

platform.given
  .app("test-app-id")
  .entities.records("Todo", [{ id: "1", title: "Existing", completed: false }]);

const created = await client.entities.Todo.create({
  title: "Write a test",
  completed: false,
});

expect(await client.entities.Todo.get(created.id)).toEqual(created);
expect(await client.entities.Todo.list()).toContainEqual(created);
expect(platform.requests.last("entities.create").body).toEqual({
  title: "Write a test",
  completed: false,
});
```

Use app-scoped named fault fixtures such as `platform.given.app("test-app-id").faults.functions.notFound("missing")` for error cases. Register reusable domain behavior (for example `functions.notificationDelivery`) rather than supplying endpoint results. Tests must not choose HTTP statuses, headers, wire envelopes, or MSW resolvers.

Global setup resets records, identities, deterministic identifiers, request journals and faults before and after every test. Initial handlers remain installed and `server.resetHandlers()` restores that same centralized set. Do not use concurrent tests against this singleton state.

## Extend the mock platform

1. Confirm the SDK request and the matching backend contract. Record the exact backend revision; distinguish current apper behavior from a deliberate legacy SDK compatibility case.
2. Add state and a domain-oriented given fixture under `tests/mocks/platform/`.
3. Add or extend the module handler there. The handler owns status codes, response shapes, validation, mutations and error serialization.
4. Journal normalized requests with `recordRequest`. Multipart journal entries preserve repeated fields, filenames, MIME types, sizes and bytes.
5. Add tests that prove behavior across SDK calls (for example create → get/list) and reset isolation. Use journal assertions only for meaningful wire contracts such as auth selection, query encoding or multipart fidelity.

Never import `msw`, `mocks/server`, or the retired `mockHttp` helper from a behavior test. Never assert inside a resolver: MSW turns resolver exceptions into HTTP 500 responses. The architecture guard enforces these boundaries.

## Coverage locations

- `entities.test.ts`: query/list/get and stateful create/update/delete/bulk/update-many behavior.
- `functions.test.ts`: JSON, multipart objects, direct FormData with repeated keys and binary bytes, raw fetch and user/service-role headers.
- `auth.test.js`, `auth-registration.test.ts`, `sso.test.ts`: current user, login and identity transitions, registration, recovery and legacy SSO compatibility.
- `agents.test.ts`, `actors.test.ts`: stateful conversations/messages and actor connection-token HTTP behavior. WebSockets remain a separate non-HTTP double.
- `integrations*.test.*`, `custom-integrations.test.ts`, `connectors*.test.ts`: domain outcomes, custom upstream envelopes, scoped tokens and proxy calls.
- `fetch-with-auth.test.ts`, `analytics.test.ts`, `app.test.ts`, `client.test.js`: fetch auth/path behavior, analytics batches, public settings and request-derived headers.

The centralized contracts are based on pinned backend source plus explicitly labeled SDK compatibility behavior. They do not prove the currently deployed production version. Live E2E remains separate.

## Explicit live E2E tests

`BASE44_RUN_E2E=true npm run test:e2e` uses `vitest.e2e.config.ts`, loads `tests/.env`, and bypasses MSW. Supply a disposable test app via `BASE44_SERVER_URL`, `BASE44_APP_ID`, and `BASE44_AUTH_TOKEN`. These tests can mutate real data and are excluded from `npm test` and unit coverage. Running without the opt-in fails before network calls begin.
