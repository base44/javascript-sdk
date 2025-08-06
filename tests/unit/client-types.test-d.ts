import { assertType, expectTypeOf } from 'vitest';
import { createClient } from '../../src/index.ts';

// Test that we can create a client with token authentication
test('should accept token authentication config', () => {
  const client = createClient({
    appId: 'test-app-id',
    token: 'test-token',
  });
  
  expectTypeOf(client).toBeObject();
  expectTypeOf(client.entities).toBeObject();
  expectTypeOf(client.auth).toBeObject();
  expectTypeOf(client.integrations).toBeObject();
});

// Test that we can create a client with API key authentication
test('should accept API key authentication config', () => {
  const client = createClient({
    appId: 'test-app-id',
    apiKey: 'test-api-key',
  });
  
  expectTypeOf(client).toBeObject();
  expectTypeOf(client.entities).toBeObject();
  expectTypeOf(client.auth).toBeObject();
  expectTypeOf(client.integrations).toBeObject();
});

// Test that we can create a client without authentication
test('should accept config without authentication', () => {
  const client = createClient({
    appId: 'test-app-id',
  });
  
  expectTypeOf(client).toBeObject();
  expectTypeOf(client.entities).toBeObject();
  expectTypeOf(client.auth).toBeObject();
  expectTypeOf(client.integrations).toBeObject();
});

// Test that we cannot pass both token and apiKey at the same time (compile-time error)
test('should not allow both token and apiKey', () => {
  // @ts-expect-error Cannot provide both token and apiKey
  assertType<never>(createClient({
    appId: 'test-app-id',
    token: 'test-token',
    apiKey: 'test-api-key',
  }));
});

// Test type constraints for token config
test('token config types', () => {
  const tokenConfig = {
    appId: 'test-app-id',
    token: 'test-token',
  };
  
  expectTypeOf(tokenConfig).toMatchTypeOf<{
    appId: string;
    token: string;
    apiKey?: never;
  }>();
});

// Test type constraints for API key config
test('api key config types', () => {
  const apiKeyConfig = {
    appId: 'test-app-id',
    apiKey: 'test-api-key',
  };
  
  expectTypeOf(apiKeyConfig).toMatchTypeOf<{
    appId: string;
    apiKey: string;
    token?: never;
  }>();
});

// Test type constraints for no auth config
test('no auth config types', () => {
  const noAuthConfig = {
    appId: 'test-app-id',
  };
  
  expectTypeOf(noAuthConfig).toMatchTypeOf<{
    appId: string;
    token?: never;
    apiKey?: never;
  }>();
});