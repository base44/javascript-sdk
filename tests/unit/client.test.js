import { createClient, createClientFromRequest } from '../../src/index.ts';
import { describe, test, expect } from 'vitest';

describe('Client Creation', () => {
  test('should create a client with default options', () => {
    const client = createClient({
      appId: 'test-app-id',
    });
    
    expect(client).toBeDefined();
    expect(client.entities).toBeDefined();
    expect(client.integrations).toBeDefined();
    expect(client.auth).toBeDefined();
    
    const config = client.getConfig();
    expect(config.appId).toBe('test-app-id');
    expect(config.serverUrl).toBe('https://base44.app');
    expect(config.requiresAuth).toBe(false);
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
  });

  test('should create a client with service token', () => {
    const client = createClient({
      appId: 'test-app-id',
      serviceToken: 'service-token-123',
    });
    
    expect(client).toBeDefined();
    expect(client.entities).toBeDefined();
    expect(client.integrations).toBeDefined();
    expect(client.auth).toBeDefined();
    expect(client.asServiceRole).toBeDefined();
    expect(client.asServiceRole.entities).toBeDefined();
    expect(client.asServiceRole.integrations).toBeDefined();
    expect(client.asServiceRole.functions).toBeDefined();
    // Service role should not have auth module
    expect(client.asServiceRole.auth).toBeUndefined();
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
  });

  test('should create client from request with minimal headers', () => {
    const mockRequest = {
      headers: {
        get: (name) => {
          const headers = {
            'Base44-App-Id': 'minimal-app-id'
          };
          return headers[name] || null;
        }
      }
    };

    const client = createClientFromRequest(mockRequest);
    
    expect(client).toBeDefined();
    const config = client.getConfig();
    expect(config.appId).toBe('minimal-app-id');
    expect(config.serverUrl).toBe('https://base44.app'); // Default value
  });

  test('should create client with only user token', () => {
    const mockRequest = {
      headers: {
        get: (name) => {
          const headers = {
            'Authorization': 'Bearer user-only-token',
            'Base44-App-Id': 'user-app-id'
          };
          return headers[name] || null;
        }
      }
    };

    const client = createClientFromRequest(mockRequest);
    
    expect(client).toBeDefined();
    expect(client.auth).toBeDefined();
    expect(client.asServiceRole).toBeDefined();
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
  });

  test('should throw error when Base44-App-Id header is missing', () => {
    const mockRequest = {
      headers: {
        get: (name) => {
          const headers = {
            'Authorization': 'Bearer some-token'
          };
          return headers[name] || null;
        }
      }
    };

    expect(() => createClientFromRequest(mockRequest)).toThrow(
      'Base44-App-Id header is required, but is was not found on the request'
    );
  });

  test('should handle malformed authorization headers gracefully', () => {
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

    const client = createClientFromRequest(mockRequest);
    
    expect(client).toBeDefined();
    // Client should still be created even with malformed headers
    expect(client.entities).toBeDefined();
    expect(client.asServiceRole).toBeDefined();
  });

  test('should handle empty authorization headers', () => {
    const mockRequest = {
      headers: {
        get: (name) => {
          const headers = {
            'Authorization': '',
            'Base44-Service-Authorization': '',
            'Base44-App-Id': 'test-app-id'
          };
          return headers[name] || null;
        }
      }
    };

    const client = createClientFromRequest(mockRequest);
    
    expect(client).toBeDefined();
    expect(client.entities).toBeDefined();
    expect(client.asServiceRole).toBeDefined();
  });
});

describe('Service Role API', () => {
  test('should have separate service role modules', () => {
    const client = createClient({
      appId: 'test-app-id',
      serviceToken: 'service-token-123',
    });

    // User modules should exist
    expect(client.entities).toBeDefined();
    expect(client.integrations).toBeDefined();
    expect(client.auth).toBeDefined();
    expect(client.functions).toBeDefined();

    // Service role modules should exist
    expect(client.asServiceRole).toBeDefined();
    expect(client.asServiceRole.entities).toBeDefined();
    expect(client.asServiceRole.integrations).toBeDefined();
    expect(client.asServiceRole.functions).toBeDefined();

    // Service role should NOT have auth module
    expect(client.asServiceRole.auth).toBeUndefined();

    // They should be different instances
    expect(client.entities).not.toBe(client.asServiceRole.entities);
    expect(client.integrations).not.toBe(client.asServiceRole.integrations);
    expect(client.functions).not.toBe(client.asServiceRole.functions);
  });

  test('should work without service token', () => {
    const client = createClient({
      appId: 'test-app-id',
      token: 'user-token-123',
    });

    // Service role should still exist but without token
    expect(client.asServiceRole).toBeDefined();
    expect(client.asServiceRole.entities).toBeDefined();
    expect(client.asServiceRole.integrations).toBeDefined();
    expect(client.asServiceRole.functions).toBeDefined();
    expect(client.asServiceRole.auth).toBeUndefined();
  });
}); 