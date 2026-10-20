import { describe, test, expect, beforeAll } from 'vitest';
import { createClient, Base44Error } from '../../src/index.ts';
import { getTestConfig } from '../utils/test-config.js';

// Get test configuration
const config = getTestConfig();

describe('Custom Integrations operations (E2E)', () => {
  let base44;

  beforeAll(() => {
    // Initialize the SDK client
    base44 = createClient({
      serverUrl: config.serverUrl,
      appId: config.appId,
    });

    // Set the authentication token
    if (config.token) {
      base44.setToken(config.token);
    }
  });

  test('should handle non-existent custom integration gracefully', async () => {
    try {
      await base44.integrations.custom.call(
        'nonexistent-integration-slug',
        'nonexistent-operation',
        {}
      );
      // If we get here, the test should fail
      fail('Expected an error but none was thrown');
    } catch (error) {
      // Expect a Base44Error with 404 status
      expect(error).toBeInstanceOf(Base44Error);
      expect(error.status).toBe(404);
    }
  });

  test('should handle non-existent operation in existing integration gracefully', async () => {
    // This test requires a real custom integration to be set up
    // Skip if TEST_CUSTOM_INTEGRATION_SLUG is not set
    if (!process.env.TEST_CUSTOM_INTEGRATION_SLUG) {
      console.log('Skipping: TEST_CUSTOM_INTEGRATION_SLUG not set');
      return;
    }

    try {
      await base44.integrations.custom.call(
        process.env.TEST_CUSTOM_INTEGRATION_SLUG,
        'nonexistent-operation-id',
        {}
      );
      fail('Expected an error but none was thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(Base44Error);
      expect(error.status).toBe(404);
    }
  });

  test('should call a real custom integration successfully', async () => {
    // This test requires a real custom integration to be set up
    // Skip if required env vars are not set
    if (
      !process.env.TEST_CUSTOM_INTEGRATION_SLUG ||
      !process.env.TEST_CUSTOM_INTEGRATION_OPERATION
    ) {
      console.log(
        'Skipping: TEST_CUSTOM_INTEGRATION_SLUG or TEST_CUSTOM_INTEGRATION_OPERATION not set'
      );
      return;
    }

    try {
      const result = await base44.integrations.custom.call(
        process.env.TEST_CUSTOM_INTEGRATION_SLUG,
        process.env.TEST_CUSTOM_INTEGRATION_OPERATION,
        {
          // Parse params from env if provided
          ...(process.env.TEST_CUSTOM_INTEGRATION_PARAMS
            ? JSON.parse(process.env.TEST_CUSTOM_INTEGRATION_PARAMS)
            : {}),
        }
      );

      // Verify we got a response with expected structure
      expect(result).toBeTruthy();
      expect(typeof result.success).toBe('boolean');
      expect(typeof result.status_code).toBe('number');
      expect(result).toHaveProperty('data');
    } catch (error) {
      if (error instanceof Base44Error) {
        console.error(`API Error: ${error.status} - ${error.message}`);
      }
      throw error;
    }
  });

  test('custom.call should validate required parameters', async () => {
    // Test that calling without slug throws an error
    try {
      // @ts-expect-error Testing invalid input
      await base44.integrations.custom.call();
      fail('Expected an error but none was thrown');
    } catch (error) {
      expect(error.message).toContain('slug');
    }

    // Test that calling without operationId throws an error
    try {
      // @ts-expect-error Testing invalid input
      await base44.integrations.custom.call('some-slug');
      fail('Expected an error but none was thrown');
    } catch (error) {
      expect(error.message).toContain('Operation');
    }
  });
});

