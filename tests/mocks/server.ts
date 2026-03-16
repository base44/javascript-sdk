/**
 * MSW (Mock Service Worker) server for unit tests.
 *
 * ## How to add new handlers
 *
 * Call `server.use()` inside a test to register per-test handlers.
 * They are automatically removed after each test by the global `afterEach`
 * in `tests/setup.js` (via `server.resetHandlers()`).
 *
 * ```ts
 * import { http, HttpResponse } from 'msw';
 * import { server } from '../mocks/server';
 *
 * test('my test', async () => {
 *   server.use(
 *     http.get('https://api.base44.com/api/apps/test-app-id/entities/Todo', () =>
 *       HttpResponse.json([{ id: '1', title: 'Test' }])
 *     )
 *   );
 *   // ... test code
 * });
 * ```
 *
 * ## Architecture
 *
 * ```
 * Vitest test → SDK (axios / fetch) → MSW Node server → handler → fake response
 * ```
 *
 * MSW intercepts requests at the Node.js http layer (`@mswjs/interceptors`)
 * and also intercepts native `fetch` calls. No axios mocking or `vi.stubGlobal`
 * needed.
 *
 * ## Modules and their base URL patterns
 *
 * | Module       | Base path                                                        |
 * |--------------|------------------------------------------------------------------|
 * | entities     | `/api/apps/:appId/entities/:entityName`                          |
 * | auth         | `/api/apps/:appId/entities/User/me`, `/api/apps/:appId/auth/...` |
 * | functions    | `/api/apps/:appId/functions/:name`, `/api/functions/:name`       |
 * | integrations | `/api/apps/:appId/integration-endpoints/:pkg/:endpoint`          |
 * | custom-int   | `/api/apps/:appId/integrations/custom/:slug/:operationId`        |
 * | connectors   | `/api/apps/:appId/external-auth/tokens/:type`                    |
 */
import { setupServer } from 'msw/node';

export const server = setupServer();
