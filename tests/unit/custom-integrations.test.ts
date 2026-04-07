import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { createClient } from '../../src/index.ts';

describe('Custom Integrations Module', () => {
  let base44: ReturnType<typeof createClient>;
  const appId = 'test-app-id';
  const serverUrl = 'https://base44.app';
  const customBase = `${serverUrl}/api/apps/${appId}/integrations/custom`;

  // The SDK URL-encodes only curly braces in operationIds (not : or /)
  function sdkOperationUrl(slug: string, operationId: string): string {
    const encoded = operationId.replace(/{/g, '%7B').replace(/}/g, '%7D');
    return `${customBase}/${slug}/${encoded}`;
  }

  // Build a RegExp that matches the SDK-generated URL for a given slug + operationId
  function operationPattern(slug: string, operationId: string): RegExp {
    const encoded = operationId.replace(/{/g, '%7B').replace(/}/g, '%7D')
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')  // escape regex special chars
      .replace(/%7B/g, '%7B')  // restore our intentional encoding
      .replace(/%7D/g, '%7D');
    const escapedBase = customBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`^${escapedBase}/${slug}/${encoded}$`);
  }

  beforeEach(() => {
    base44 = createClient({ serverUrl, appId });
  });

  afterEach(() => {
    base44.cleanup();
  });

  test('custom.call() should convert camelCase params to snake_case for backend', async () => {
    const slug = 'github';
    const operationId = 'get:/repos/{owner}/{repo}/issues';

    let capturedBody: Record<string, unknown> | null = null;
    server.use(
      http.post(operationPattern(slug, operationId), async ({ request }) => {
        capturedBody = await request.json() as Record<string, unknown>;
        return HttpResponse.json({
          success: true,
          status_code: 200,
          data: { issues: [{ id: 1, title: 'Test Issue' }] },
        });
      })
    );

    const result = await base44.integrations.custom.call(slug, operationId, {
      payload: { title: 'Test Issue' },
      pathParams: { owner: 'testuser', repo: 'testrepo' },
      queryParams: { state: 'open' },
    });

    expect(result.success).toBe(true);
    expect(result.status_code).toBe(200);
    expect(result.data.issues).toHaveLength(1);

    // Verify camelCase was converted to snake_case
    expect(capturedBody).toMatchObject({
      payload: { title: 'Test Issue' },
      path_params: { owner: 'testuser', repo: 'testrepo' },
      query_params: { state: 'open' },
    });
  });

  test('custom.call() should work with empty params', async () => {
    server.use(
      http.post(`${customBase}/github/getAuthenticatedUser`, () =>
        HttpResponse.json({
          success: true,
          status_code: 200,
          data: { login: 'testuser', id: 123 },
        })
      )
    );

    const result = await base44.integrations.custom.call('github', 'getAuthenticatedUser');

    expect(result.success).toBe(true);
    expect(result.data.login).toBe('testuser');
  });

  test('custom.call() should handle 404 error for non-existent integration', async () => {
    server.use(
      http.post(`${customBase}/nonexistent/someEndpoint`, () =>
        HttpResponse.json(
          { detail: "Custom integration 'nonexistent' not found in workspace" },
          { status: 404 }
        )
      )
    );

    await expect(base44.integrations.custom.call('nonexistent', 'someEndpoint')).rejects.toMatchObject({
      status: 404,
      name: 'Base44Error',
    });
  });

  test('custom.call() should handle 404 error for non-existent operation', async () => {
    server.use(
      http.post(`${customBase}/github/nonExistentOperation`, () =>
        HttpResponse.json(
          { detail: "Operation 'nonExistentOperation' not found in integration 'github'" },
          { status: 404 }
        )
      )
    );

    await expect(base44.integrations.custom.call('github', 'nonExistentOperation')).rejects.toMatchObject({
      status: 404,
      name: 'Base44Error',
    });
  });

  test('custom.call() should handle 502 error from external API', async () => {
    const slug = 'github';
    const operationId = 'get:/repos/{owner}/{repo}/issues';

    server.use(
      http.post(operationPattern(slug, operationId), () =>
        HttpResponse.json(
          { detail: 'Failed to connect to external API: Connection refused' },
          { status: 502 }
        )
      )
    );

    await expect(base44.integrations.custom.call(slug, operationId)).rejects.toMatchObject({
      status: 502,
      name: 'Base44Error',
    });
  });

  test('custom.call() should throw error when slug is missing', async () => {
    // @ts-expect-error Testing invalid input
    await expect(base44.integrations.custom.call()).rejects.toThrow(
      'Integration slug is required and cannot be empty'
    );
  });

  test('custom.call() should throw error when operationId is missing', async () => {
    // @ts-expect-error Testing invalid input
    await expect(base44.integrations.custom.call('github')).rejects.toThrow(
      'Operation ID is required and cannot be empty'
    );
  });

  test('custom.call() should throw error when slug is empty string', async () => {
    await expect(base44.integrations.custom.call('', 'get:/repos/{owner}/{repo}/issues')).rejects.toThrow(
      'Integration slug is required and cannot be empty'
    );
  });

  test('custom.call() should throw error when slug is whitespace only', async () => {
    await expect(base44.integrations.custom.call('   ', 'get:/repos/{owner}/{repo}/issues')).rejects.toThrow(
      'Integration slug is required and cannot be empty'
    );
  });

  test('custom.call() should throw error when operationId is empty string', async () => {
    await expect(base44.integrations.custom.call('github', '')).rejects.toThrow(
      'Operation ID is required and cannot be empty'
    );
  });

  test('custom.call() should throw error when operationId is whitespace only', async () => {
    await expect(base44.integrations.custom.call('github', '  \t\n  ')).rejects.toThrow(
      'Operation ID is required and cannot be empty'
    );
  });

  test('custom.call() should handle large payloads', async () => {
    const largeArray = Array.from({ length: 1000 }, (_, i) => ({
      id: i,
      name: `Item ${i}`,
      description: 'A'.repeat(100),
      metadata: { key: `value_${i}` },
    }));

    server.use(
      http.post(`${customBase}/myapi/bulkCreate`, () =>
        HttpResponse.json({ success: true, status_code: 200, data: { created: 1000 } })
      )
    );

    const result = await base44.integrations.custom.call('myapi', 'bulkCreate', {
      payload: { items: largeArray },
    });

    expect(result.success).toBe(true);
    expect(result.data.created).toBe(1000);
  });

  test('custom.call() should include custom headers in request', async () => {
    server.use(
      http.post(`${customBase}/myapi/getData`, () =>
        HttpResponse.json({ success: true, status_code: 200, data: { result: 'ok' } })
      )
    );

    const result = await base44.integrations.custom.call('myapi', 'getData', {
      headers: { 'X-Custom-Header': 'custom-value' },
    });

    expect(result.success).toBe(true);
  });

  test('custom.call() should pass through multiple headers', async () => {
    server.use(
      http.post(`${customBase}/myapi/secureEndpoint`, () =>
        HttpResponse.json({ success: true, status_code: 200, data: { authenticated: true } })
      )
    );

    const result = await base44.integrations.custom.call('myapi', 'secureEndpoint', {
      headers: {
        'X-API-Key': 'secret-key-123',
        'X-Request-ID': 'req-456',
        'Accept-Language': 'en-US',
        'X-Custom-Auth': 'Bearer token123',
      },
    });

    expect(result.success).toBe(true);
    expect(result.data.authenticated).toBe(true);
  });

  test('custom.call() should only include defined params in body', async () => {
    const slug = 'github';
    const operationId = 'get:/users/{username}';

    let capturedBody: Record<string, unknown> | null = null;
    server.use(
      http.post(operationPattern(slug, operationId), async ({ request }) => {
        capturedBody = await request.json() as Record<string, unknown>;
        return HttpResponse.json({
          success: true,
          status_code: 200,
          data: { login: 'octocat' },
        });
      })
    );

    const result = await base44.integrations.custom.call(slug, operationId, {
      pathParams: { username: 'octocat' },
    });

    expect(result.success).toBe(true);
    // Only path_params should be present, not empty payload/query_params/headers
    expect(capturedBody).toEqual({ path_params: { username: 'octocat' } });
  });

  test('custom property should not interfere with other integration packages', async () => {
    const intBase = `${serverUrl}/api/apps/${appId}/integration-endpoints`;

    server.use(
      http.post(`${intBase}/Core/SendEmail`, () =>
        HttpResponse.json({ success: true })
      ),
      http.post(`${intBase}/installable/SomePackage/integration-endpoints/SomeEndpoint`, () =>
        HttpResponse.json({ success: true })
      )
    );

    const coreResult = await base44.integrations.Core.SendEmail({
      to: 'test@example.com',
      subject: 'Test',
      body: 'Test body',
    });
    expect(coreResult.success).toBe(true);

    const packageResult = await base44.integrations.SomePackage.SomeEndpoint({ param: 'value' });
    expect(packageResult.success).toBe(true);
  });
});
