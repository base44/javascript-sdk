import { createClient } from '../../src/index.ts';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import nock from 'nock';

describe('API Key Authentication', () => {
  let client;
  const testAppId = 'test-app-id';
  const testApiKey = 'test-api-key';
  const baseURL = 'https://base44.app';

  beforeEach(() => {
    // Clean up any previous nock interceptors
    nock.cleanAll();
    
    client = createClient({
      appId: testAppId,
      apiKey: testApiKey,
    });
  });

  test('should send API key in header for requests', async () => {
    // Mock a request to verify the API key header is sent
    const scope = nock(baseURL)
      .matchHeader('api_key', testApiKey)
      .get('/api/apps/test-app-id/entities/TestEntity')
      .reply(200, { data: 'test response' });

    try {
      await client.entities.get('TestEntity');
    } catch (error) {
      // The request might fail due to other reasons, but we're testing the header
    }

    // Verify the request was made with the correct header
    expect(scope.isDone()).toBe(true);
  });

  test('should not send Authorization header when using API key', async () => {
    const scope = nock(baseURL)
      .get('/api/apps/test-app-id/entities/TestEntity')
      .reply(function() {
        // Verify Authorization header is not present
        expect(this.req.headers.authorization).toBeUndefined();
        // Verify API key header is present
        expect(this.req.headers.api_key).toBe(testApiKey);
        return [200, { data: 'test response' }];
      });

    try {
      await client.entities.get('TestEntity');
    } catch (error) {
      // The request might fail due to other reasons, but we're testing the header
    }

    expect(scope.isDone()).toBe(true);
  });

  describe('User-specific method restrictions', () => {
    test('auth.me() should throw error with API key', async () => {
      await expect(client.auth.me()).rejects.toThrow(
        'The .me() method cannot be used with API key authentication. This method requires a user token to access user-specific data.'
      );
    });

    test('auth.updateMe() should throw error with API key', async () => {
      await expect(client.auth.updateMe({})).rejects.toThrow(
        'The .updateMe() method cannot be used with API key authentication. This method requires a user token to access user-specific data.'
      );
    });

    test('auth.login() should throw error with API key', () => {
      expect(() => client.auth.login('/')).toThrow(
        'The .login() method cannot be used with API key authentication. API keys do not require user login flows.'
      );
    });

    test('auth.logout() should throw error with API key', () => {
      expect(() => client.auth.logout()).toThrow(
        'The .logout() method cannot be used with API key authentication. API keys do not have user sessions to logout from.'
      );
    });

    test('auth.setToken() should throw error with API key', () => {
      expect(() => client.auth.setToken('new-token')).toThrow(
        'The .setToken() method cannot be used with API key authentication. API keys are set during client initialization.'
      );
    });

    test('auth.loginViaUsernamePassword() should throw error with API key', async () => {
      await expect(client.auth.loginViaUsernamePassword('test@example.com', 'password')).rejects.toThrow(
        'The .loginViaUsernamePassword() method cannot be used with API key authentication. API keys do not require user login flows.'
      );
    });

    test('auth.isAuthenticated() should throw error with API key', async () => {
      await expect(client.auth.isAuthenticated()).rejects.toThrow(
        'The .isAuthenticated() method cannot be used with API key authentication. API keys do not have user authentication states.'
      );
    });
  });
});