import { createClient } from '../../src/index.ts';
import { describe, test, expect } from 'vitest';

describe('Client Configuration Types', () => {
  test('should accept token authentication config', () => {
    const client = createClient({
      appId: 'test-app-id',
      token: 'test-token',
    });
    
    expect(client).toBeDefined();
  });

  test('should accept API key authentication config', () => {
    const client = createClient({
      appId: 'test-app-id',
      apiKey: 'test-api-key',
    });
    
    expect(client).toBeDefined();
  });

  test('should accept config without authentication', () => {
    const client = createClient({
      appId: 'test-app-id',
    });
    
    expect(client).toBeDefined();
  });

  // Note: TypeScript compile-time tests would prevent passing both token and apiKey
  // at the same time, but we can't test compile-time errors in runtime tests.
  // The mutual exclusion is enforced by the TypeScript type system.
});