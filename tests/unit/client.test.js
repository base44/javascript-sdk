import { createClient } from '../../src/index.ts';
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
    expect(config.env).toBe('prod');
    expect(config.requiresAuth).toBe(false);
  });
  
  test('should create a client with custom options', () => {
    const client = createClient({
      appId: 'test-app-id',
      serverUrl: 'https://custom-server.com',
      env: 'dev',
      requiresAuth: true,
      token: 'test-token',
    });
    
    expect(client).toBeDefined();
    
    const config = client.getConfig();
    expect(config.appId).toBe('test-app-id');
    expect(config.serverUrl).toBe('https://custom-server.com');
    expect(config.env).toBe('dev');
    expect(config.requiresAuth).toBe(true);
  });

  test('should create a client with API key', () => {
    const client = createClient({
      appId: 'test-app-id',
      apiKey: 'test-api-key',
    });
    
    expect(client).toBeDefined();
    expect(client.entities).toBeDefined();
    expect(client.integrations).toBeDefined();
    expect(client.auth).toBeDefined();
    
    const config = client.getConfig();
    expect(config.appId).toBe('test-app-id');
    expect(config.serverUrl).toBe('https://base44.app');
    expect(config.env).toBe('prod');
    expect(config.requiresAuth).toBe(false);
  });
}); 