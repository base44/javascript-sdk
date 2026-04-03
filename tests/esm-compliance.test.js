/**
 * Test to verify ES module compliance by importing the built SDK
 * This test runs against the compiled output to catch import issues
 */
import { createClient } from '../dist/index.js';
import { describe, it, expect } from 'vitest';

describe('ES Module Compliance', () => {
  it('should import the SDK successfully from built dist', () => {
    expect(createClient).toBeDefined();
    expect(typeof createClient).toBe('function');
  });

  it('should create a client instance', () => {
    const client = createClient({
      apiKey: 'test-key',
      baseURL: 'https://api.test.com'
    });
    expect(client).toBeDefined();
  });
});