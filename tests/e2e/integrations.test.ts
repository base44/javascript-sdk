import { describe, test, expect, beforeAll } from 'vitest';
import { createClient, Base44Error } from '../../src/index.js';
import { getTestConfig, type TestConfig } from '../utils/test-config.js';

// Get test configuration
const config: TestConfig = getTestConfig();

describe('Integration operations (E2E)', () => {
  let base44: ReturnType<typeof createClient>;

  beforeAll(() => {
    // Initialize the SDK client
    base44 = createClient({
      serverUrl: config.serverUrl,
      appId: config.appId!,
    });

    // Set the authentication token
    if (config.token) {
      base44.setToken(config.token);
    }
  });

  test('should be able to send an email via Core integration', async () => {
    // This test is potentially destructive (sending real emails)
    // so we'll skip it by default, but you can enable it by adding TEST_EMAIL env var
    if (!process.env.TEST_EMAIL) {
      console.log('Skipping email test: TEST_EMAIL not set');
      return;
    }

    try {
      const result = await (base44.integrations as any).Core.SendEmail({
        to: process.env.TEST_EMAIL,
        subject: 'Test Email from Base44 SDK Tests',
        body: 'This is a test email sent from the Base44 SDK E2E tests.',
      });

      // Assertions
      expect(result).toBeTruthy();
      // Add more specific assertions based on your API's response format
    } catch (error: any) {
      if (error instanceof Base44Error) {
        console.error(`API Error: ${error.status} - ${error.message}`);
      }
      throw error;
    }
  });

  // This is a safer test that doesn't perform destructive operations
  test('should handle non-existent integration gracefully', async () => {
    try {
      await (base44.integrations as any).NonExistentPackage.NonExistentEndpoint({});
      // If we get here, the test should fail
      throw new Error('Expected an error but none was thrown');
    } catch (error: any) {
      // Expect a Base44Error with appropriate status
      expect(error).toBeInstanceOf(Base44Error);
      // Typically a 404 for not found, but may vary
      expect(error.status).toBeGreaterThanOrEqual(400);
    }
  });
}); 