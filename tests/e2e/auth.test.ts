import { describe, test, expect, beforeAll } from 'vitest';
import { createClient, Base44Error } from '../../src/index.js';
import { getTestConfig, type TestConfig } from '../utils/test-config.js';

// Get test configuration
const config: TestConfig = getTestConfig();

describe('Auth operations (E2E)', () => {
  let base44: ReturnType<typeof createClient>;

  beforeAll(() => {
    // Initialize the SDK client
    base44 = createClient({
      serverUrl: config.serverUrl,
      appId: config.appId!,
    });
  });

  test('should be able to set a token', () => {
    // Test that setToken doesn't throw an error
    expect(() => {
      base44.setToken('test-token-12345');
    }).not.toThrow();
  });

  test('should handle authentication check correctly', async () => {
    if (!config.token) {
      console.log('Skipping test: BASE44_AUTH_TOKEN not set');
      return;
    }

    // Set the real token
    base44.setToken(config.token);
    
    // Check authentication
    const isAuthenticated = await base44.auth.isAuthenticated();
    expect(isAuthenticated).toBe(true);
    
    // Check with invalid token
    base44.setToken('invalid-token');
    const isAuthenticatedWithInvalidToken = await base44.auth.isAuthenticated();
    expect(isAuthenticatedWithInvalidToken).toBe(false);
    
    // Restore the real token
    base44.setToken(config.token);
  });

  test('should be able to get current user information', async () => {
    if (!config.token) {
      console.log('Skipping test: BASE44_AUTH_TOKEN not set');
      return;
    }

    // Set the authentication token
    base44.setToken(config.token);
    
    try {
      const me = await base44.auth.me();
      
      // Assertions
      expect(me).toBeTruthy();
      expect(me).toHaveProperty('id');
      // Check for other user properties depending on your User entity structure
    } catch (error: any) {
      if (error instanceof Base44Error) {
        console.error(`API Error: ${error.status} - ${error.message}`);
      }
      throw error;
    }
  });
}); 