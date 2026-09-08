# SDK HTTP tests

`npm test` runs TypeScript API tests and the hermetic unit suite. `npm run test:coverage` reports unit coverage. Tests exercise the actual SDK HTTP clients through MSW v2; no API credentials or `tests/.env` are loaded. Unexpected traffic fails the test even when the SDK catches the network error. Never change the unit server to `warn` or `bypass` to make a test pass.

## Add an HTTP contract

Use `mockHttp` for finite request expectations. It registers native MSW handlers, captures requests, and checks bodies, headers, query parameters and call counts in teardown. This preserves request assertions on error paths: throwing directly in an MSW resolver becomes a 500 response, which an error-handling test may accidentally accept.

```ts
import { mockHttp } from '../mocks/http';

mockHttp({
  method: 'post',
  url: 'https://api.base44.com/api/apps/test-app/entities/Todo',
  body: { title: 'Write a test' },
  headers: [['authorization', 'Bearer test-token']],
  status: 201,
  response: { id: 'todo-1', title: 'Write a test' },
});
const todo = await client.entities.Todo.create({ title: 'Write a test' });
expect(todo.id).toBe('todo-1');
```

Each expectation defaults to one call; set `times` for repeated requests. Register the same method/URL several times for ordered responses. URL matching is exact, including escaped operation IDs; query checks are explicit. `networkError: true` simulates a transport failure; `delayMs` tests concurrent request behavior.

For multipart or binary payloads, use `inspect: async (request) => { ... }`. Parse `await request.formData()`, then assert field values, repeated keys, file names/MIME types and file bytes. These assertions are captured and rethrown in teardown, independently of the HTTP response. `body` predicates can capture JSON requests for assertions in the test. `mockHttp` is intentionally a small test fixture, not a simulation of backend business logic.

For streams, dynamic state or other specialized behavior, use MSW directly:

```ts
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';

let received: unknown;
server.use(http.post('https://example.test/api/example', async ({ request }) => {
  received = await request.json();
  return HttpResponse.json({ ok: true });
}));
await clientOperation();
expect(received).toEqual({ expected: 'payload' });
```

Keep assertions outside direct resolvers. Return explicit status codes/error bodies; do not add permissive fallback handlers. Cleanup clients with `client.cleanup()` after each test, and reset any browser globals/timers installed by the test. Global setup always removes per-test handlers and verifies expected/unexpected traffic. Tests using timers must drain pending SDK work before teardown.

## Coverage locations

- `entities.test.ts`: list/filter/get/create/update/delete/deleteMany/bulkCreate/updateMany, including advanced query syntax.
- `functions.test.ts`: JSON, multipart objects, caller-supplied FormData (including repeated keys and binary files), raw fetch and user/service-role headers.
- `auth.test.js`, `auth-registration.test.ts`, `sso.test.ts`: current user, login, concurrent identity transitions, registration, password reset and SSO token transport.
- `agents.test.ts`, `actors.test.ts`: agent conversations/messages and actor connection-token HTTP contracts. WebSocket constructors remain separate non-HTTP test doubles.
- `integrations.test.js`, `integrations.test.ts`, `custom-integrations.test.ts`, `connectors*.test.ts`: integration payloads/errors, tokens, scoped connections and metered proxy calls.
- `fetch-with-auth.test.ts`, `analytics.test.ts`, `app.test.ts`, `client.test.js`: fetch auth/path behavior, analytics traffic, public settings and request-derived headers.

The fixtures are grounded in current SDK wire contracts, not a claim that every real backend route has been independently validated. Live E2E tests remain a separate check.

## Explicit live E2E tests

`BASE44_RUN_E2E=true npm run test:e2e` uses `vitest.e2e.config.ts`, loads `tests/.env`, and bypasses MSW entirely. Supply a dedicated disposable test application via `BASE44_SERVER_URL`, `BASE44_APP_ID`, and `BASE44_AUTH_TOKEN`. These tests can create/delete platform data. They are excluded from `npm test` and unit coverage. Running `npm run test:e2e` without opt-in fails before tests or network calls begin.
