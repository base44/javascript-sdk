import { createClient, createClientFromRequest } from '../../src/index.ts';
import { describe, test, expect, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';

describe('Client Creation', () => {
  test('should create a client with default options', () => {
    const client = createClient({ appId: 'test-app-id' });

    expect(client).toBeDefined();
    expect(client.entities).toBeDefined();
    expect(client.integrations).toBeDefined();
    expect(client.auth).toBeDefined();
    expect(client.analytics).toBeDefined();

    const config = client.getConfig();
    expect(config.appId).toBe('test-app-id');
    expect(config.serverUrl).toBe('https://base44.app');
    expect(config.requiresAuth).toBe(false);

    expect(() => client.asServiceRole).toThrow('Service token is required to use asServiceRole. Please provide a serviceToken when creating the client.');

    client.cleanup();
  });

  test('should create a client with custom options', () => {
    const client = createClient({
      appId: 'test-app-id',
      serverUrl: 'https://custom-server.com',
      requiresAuth: true,
      token: 'test-token',
    });

    expect(client).toBeDefined();

    const config = client.getConfig();
    expect(config.appId).toBe('test-app-id');
    expect(config.serverUrl).toBe('https://custom-server.com');
    expect(config.requiresAuth).toBe(true);

    client.cleanup();
  });

  test('should create a client with service token', () => {
    const client = createClient({ appId: 'test-app-id', serviceToken: 'service-token-123' });

    expect(client).toBeDefined();
    expect(client.entities).toBeDefined();
    expect(client.integrations).toBeDefined();
    expect(client.auth).toBeDefined();
    expect(client.asServiceRole).toBeDefined();
    expect(client.asServiceRole.entities).toBeDefined();
    expect(client.asServiceRole.integrations).toBeDefined();
    expect(client.asServiceRole.functions).toBeDefined();
    expect(client.asServiceRole.auth).toBeUndefined();

    client.cleanup();
  });

  test('should create a client with both user token and service token', () => {
    const client = createClient({
      appId: 'test-app-id',
      token: 'user-token-123',
      serviceToken: 'service-token-123',
      requiresAuth: true,
    });

    expect(client).toBeDefined();
    expect(client.entities).toBeDefined();
    expect(client.integrations).toBeDefined();
    expect(client.auth).toBeDefined();
    expect(client.asServiceRole).toBeDefined();
    expect(client.asServiceRole.entities).toBeDefined();
    expect(client.asServiceRole.integrations).toBeDefined();
    expect(client.asServiceRole.functions).toBeDefined();
    expect(client.asServiceRole.auth).toBeUndefined();

    client.cleanup();
  });
});

describe('appBaseUrl Normalization', () => {
  test('should use appBaseUrl when provided as a string', () => {
    const customAppBaseUrl = 'https://custom-app.example.com';
    const client = createClient({ appId: 'test-app-id', appBaseUrl: customAppBaseUrl });

    const originalWindow = global.window;
    const mockLocation = { href: '', origin: 'https://current-app.com' };
    global.window = { location: mockLocation };

    client.auth.redirectToLogin('https://example.com/dashboard');

    expect(mockLocation.href).toBe(
      `${customAppBaseUrl}/login?from_url=${encodeURIComponent('https://example.com/dashboard')}`
    );

    global.window = originalWindow;
    client.cleanup();
  });

  test('should normalize appBaseUrl to empty string when not provided', () => {
    const client = createClient({ appId: 'test-app-id' });

    const originalWindow = global.window;
    const mockLocation = { href: '', origin: 'https://current-app.com' };
    global.window = { location: mockLocation };

    client.auth.redirectToLogin('https://example.com/dashboard');

    expect(mockLocation.href).toBe(
      `/login?from_url=${encodeURIComponent('https://example.com/dashboard')}`
    );

    global.window = originalWindow;
    client.cleanup();
  });
});

describe('createClientFromRequest', () => {
  test('should create client from request with all headers', () => {
    const mockRequest = {
      headers: {
        get: (name) => {
          const headers = {
            'Authorization': 'Bearer user-token-123',
            'Base44-Service-Authorization': 'Bearer service-token-123',
            'Base44-App-Id': 'test-app-id',
            'Base44-Api-Url': 'https://custom-server.com'
          };
          return headers[name] || null;
        }
      }
    };

    const client = createClientFromRequest(mockRequest);

    expect(client).toBeDefined();
    expect(client.entities).toBeDefined();
    expect(client.integrations).toBeDefined();
    expect(client.auth).toBeDefined();
    expect(client.asServiceRole).toBeDefined();

    const config = client.getConfig();
    expect(config.appId).toBe('test-app-id');
    expect(config.serverUrl).toBe('https://custom-server.com');

    client.cleanup();
  });

  test('should create client from request with minimal headers', () => {
    const mockRequest = {
      headers: {
        get: (name) => {
          const headers = { 'Base44-App-Id': 'minimal-app-id' };
          return headers[name] || null;
        }
      }
    };

    const client = createClientFromRequest(mockRequest);

    expect(client).toBeDefined();
    const config = client.getConfig();
    expect(config.appId).toBe('minimal-app-id');
    expect(config.serverUrl).toBe('https://base44.app');

    client.cleanup();
  });

  test('should create client with only user token', () => {
    const mockRequest = {
      headers: {
        get: (name) => {
          const headers = { 'Authorization': 'Bearer user-only-token', 'Base44-App-Id': 'user-app-id' };
          return headers[name] || null;
        }
      }
    };

    const client = createClientFromRequest(mockRequest);

    expect(client).toBeDefined();
    expect(client.auth).toBeDefined();
    expect(() => client.asServiceRole).toThrow('Service token is required to use asServiceRole. Please provide a serviceToken when creating the client.');

    client.cleanup();
  });

  test('should create client with only service token', () => {
    const mockRequest = {
      headers: {
        get: (name) => {
          const headers = {
            'Base44-Service-Authorization': 'Bearer service-only-token',
            'Base44-App-Id': 'service-app-id'
          };
          return headers[name] || null;
        }
      }
    };

    const client = createClientFromRequest(mockRequest);

    expect(client).toBeDefined();
    expect(client.auth).toBeDefined();
    expect(client.asServiceRole).toBeDefined();

    client.cleanup();
  });

  test('should throw error when Base44-App-Id header is missing', () => {
    const mockRequest = {
      headers: {
        get: (name) => {
          const headers = { 'Authorization': 'Bearer some-token' };
          return headers[name] || null;
        }
      }
    };

    expect(() => createClientFromRequest(mockRequest)).toThrow(
      'Base44-App-Id header is required, but is was not found on the request'
    );
  });

  test('should throw error for malformed authorization headers', () => {
    const mockRequest = {
      headers: {
        get: (name) => {
          const headers = {
            'Authorization': 'InvalidFormat',
            'Base44-Service-Authorization': 'AlsoInvalid',
            'Base44-App-Id': 'test-app-id'
          };
          return headers[name] || null;
        }
      }
    };

    expect(() => createClientFromRequest(mockRequest)).toThrow('Invalid authorization header format. Expected "Bearer <token>"');
  });

  test('should throw error for empty authorization headers', () => {
    const mockRequest = {
      headers: {
        get: (name) => {
          const headers = {
            'Authorization': '',
            'Base44-Service-Authorization': '',
            'Base44-App-Id': 'test-app-id'
          };
          return headers[name] === '' ? '' : headers[name] || null;
        }
      }
    };

    expect(() => createClientFromRequest(mockRequest)).toThrow('Invalid authorization header format. Expected "Bearer <token>"');
  });

  test('should propagate Base44-State header when present', () => {
    const mockRequest = {
      headers: {
        get: (name) => {
          const headers = { 'Base44-App-Id': 'test-app-id', 'Base44-State': '192.168.1.100' };
          return headers[name] || null;
        }
      }
    };

    const client = createClientFromRequest(mockRequest);

    expect(client).toBeDefined();
    const config = client.getConfig();
    expect(config.appId).toBe('test-app-id');

    client.cleanup();
  });

  test('should work without Base44-State header', () => {
    const mockRequest = {
      headers: {
        get: (name) => {
          const headers = { 'Base44-App-Id': 'test-app-id' };
          return headers[name] || null;
        }
      }
    };

    const client = createClientFromRequest(mockRequest);

    expect(client).toBeDefined();
    const config = client.getConfig();
    expect(config.appId).toBe('test-app-id');

    client.cleanup();
  });
});


describe('Service Role Authorization Headers', () => {
  const appId = 'test-app-id';
  const serverUrl = 'https://api.base44.com';
  const entitiesBase = `${serverUrl}/api/apps/${appId}/entities`;
  const intBase = `${serverUrl}/api/apps/${appId}/integration-endpoints`;
  const functionsBase = `${serverUrl}/api/apps/${appId}/functions`;

  test('should use user token for regular client operations and service token for service role operations', async () => {
    const userToken = 'user-token-123';
    const serviceToken = 'service-token-456';
    const client = createClient({ serverUrl, appId, token: userToken, serviceToken });

    const userCalls = [];
    const serviceCalls = [];

    server.use(
      http.get(`${entitiesBase}/Todo`, ({ request }) => {
        const auth = request.headers.get('Authorization');
        if (auth === `Bearer ${userToken}`) userCalls.push('user');
        if (auth === `Bearer ${serviceToken}`) serviceCalls.push('service');
        return HttpResponse.json({ items: [], total: 0 });
      })
    );

    await client.entities.Todo.list();
    await client.asServiceRole.entities.Todo.list();

    expect(userCalls).toHaveLength(1);
    expect(serviceCalls).toHaveLength(1);

    client.cleanup();
  });

  test('should use service token for service role entities operations', async () => {
    const serviceToken = 'service-token-only-123';
    const client = createClient({ serverUrl, appId, serviceToken });

    let capturedAuth = null;
    server.use(
      http.get(`${entitiesBase}/User/123`, ({ request }) => {
        capturedAuth = request.headers.get('Authorization');
        return HttpResponse.json({ id: '123', name: 'Test User' });
      })
    );

    const result = await client.asServiceRole.entities.User.get('123');

    expect(result.id).toBe('123');
    expect(result.name).toBe('Test User');
    expect(capturedAuth).toBe(`Bearer ${serviceToken}`);

    client.cleanup();
  });

  test('should use service token for service role integrations operations', async () => {
    const serviceToken = 'service-token-integration-456';
    const client = createClient({ serverUrl, appId, serviceToken });

    let capturedAuth = null;
    server.use(
      http.post(`${intBase}/Core/SendEmail`, ({ request }) => {
        capturedAuth = request.headers.get('Authorization');
        return HttpResponse.json({ success: true, messageId: '123' });
      })
    );

    const result = await client.asServiceRole.integrations.Core.SendEmail({
      to: 'test@example.com',
      subject: 'Test',
      body: 'Test message'
    });

    expect(result.success).toBe(true);
    expect(result.messageId).toBe('123');
    expect(capturedAuth).toBe(`Bearer ${serviceToken}`);

    client.cleanup();
  });

  test('should use service token for service role functions operations', async () => {
    const serviceToken = 'service-token-functions-789';
    const client = createClient({ serverUrl, appId, serviceToken });

    let capturedAuth = null;
    server.use(
      http.post(`${functionsBase}/testFunction`, ({ request }) => {
        capturedAuth = request.headers.get('Authorization');
        return HttpResponse.json({ result: 'function executed' });
      })
    );

    const result = await client.asServiceRole.functions.invoke('testFunction', { param: 'test' });

    expect(result.data.result).toBe('function executed');
    expect(capturedAuth).toBe(`Bearer ${serviceToken}`);

    client.cleanup();
  });

  test('should use user token for regular operations when both tokens are present', async () => {
    const userToken = 'user-token-regular-123';
    const serviceToken = 'service-token-regular-456';
    const client = createClient({ serverUrl, appId, token: userToken, serviceToken });

    let taskAuth = null;
    let emailAuth = null;

    server.use(
      http.get(`${entitiesBase}/Task`, ({ request }) => {
        taskAuth = request.headers.get('Authorization');
        return HttpResponse.json({ items: [{ id: 'task1', title: 'User Task' }], total: 1 });
      }),
      http.post(`${intBase}/Core/SendEmail`, ({ request }) => {
        emailAuth = request.headers.get('Authorization');
        return HttpResponse.json({ success: true, messageId: 'email123' });
      })
    );

    const taskResult = await client.entities.Task.list();
    const emailResult = await client.integrations.Core.SendEmail({
      to: 'user@example.com',
      subject: 'User Test',
      body: 'User message'
    });

    expect(taskResult.items[0].title).toBe('User Task');
    expect(emailResult.success).toBe(true);
    expect(emailResult.messageId).toBe('email123');
    expect(taskAuth).toBe(`Bearer ${userToken}`);
    expect(emailAuth).toBe(`Bearer ${userToken}`);

    client.cleanup();
  });

  test('should work without authorization header when no tokens are provided', async () => {
    const client = createClient({ serverUrl, appId });

    let capturedAuth = null;
    server.use(
      http.get(`${entitiesBase}/PublicData`, ({ request }) => {
        capturedAuth = request.headers.get('Authorization');
        return HttpResponse.json({ items: [{ id: 'public1', data: 'public' }], total: 1 });
      })
    );

    const result = await client.entities.PublicData.list();

    expect(result.items[0].data).toBe('public');
    expect(capturedAuth).toBeNull();

    client.cleanup();
  });

  test('should propagate Base44-State header in API requests when created from request', async () => {
    const clientIp = '192.168.1.100';
    const mockRequest = {
      headers: {
        get: (name) => {
          const headers = {
            'Authorization': 'Bearer user-token-123',
            'Base44-App-Id': appId,
            'Base44-Api-Url': serverUrl,
            'Base44-State': clientIp
          };
          return headers[name] || null;
        }
      }
    };

    const client = createClientFromRequest(mockRequest);

    let capturedState = null;
    let capturedAuth = null;
    server.use(
      http.get(`${entitiesBase}/Todo`, ({ request }) => {
        capturedState = request.headers.get('Base44-State');
        capturedAuth = request.headers.get('Authorization');
        return HttpResponse.json({ items: [], total: 0 });
      })
    );

    await client.entities.Todo.list();

    expect(capturedState).toBe(clientIp);
    expect(capturedAuth).toBe('Bearer user-token-123');

    client.cleanup();
  });

  test('should not include Base44-State header when not present in original request', async () => {
    const mockRequest = {
      headers: {
        get: (name) => {
          const headers = {
            'Authorization': 'Bearer user-token-123',
            'Base44-App-Id': appId,
            'Base44-Api-Url': serverUrl
          };
          return headers[name] || null;
        }
      }
    };

    const client = createClientFromRequest(mockRequest);

    let capturedState = null;
    server.use(
      http.get(`${entitiesBase}/Todo`, ({ request }) => {
        capturedState = request.headers.get('Base44-State');
        return HttpResponse.json({ items: [], total: 0 });
      })
    );

    await client.entities.Todo.list();

    expect(capturedState).toBeNull();

    client.cleanup();
  });

  test('should propagate Base44-State header in service role API requests', async () => {
    const clientIp = '10.0.0.50';
    const mockRequest = {
      headers: {
        get: (name) => {
          const headers = {
            'Base44-Service-Authorization': 'Bearer service-token-123',
            'Base44-App-Id': appId,
            'Base44-Api-Url': serverUrl,
            'Base44-State': clientIp
          };
          return headers[name] || null;
        }
      }
    };

    const client = createClientFromRequest(mockRequest);

    let capturedState = null;
    let capturedAuth = null;
    server.use(
      http.get(`${entitiesBase}/User/123`, ({ request }) => {
        capturedState = request.headers.get('Base44-State');
        capturedAuth = request.headers.get('Authorization');
        return HttpResponse.json({ id: '123', name: 'Test User' });
      })
    );

    const result = await client.asServiceRole.entities.User.get('123');

    expect(result.id).toBe('123');
    expect(capturedState).toBe(clientIp);
    expect(capturedAuth).toBe('Bearer service-token-123');

    client.cleanup();
  });
});
