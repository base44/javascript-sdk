import { describe, test, expect, beforeAll } from 'vitest';
import { createClient, Base44Error } from '../../src/index.js';
import { getTestConfig, type TestConfig } from '../utils/test-config.js';

// Get test configuration
const config: TestConfig = getTestConfig();

// Helper function to safely log error information without circular references
const logErrorSafely = (error: any) => {
  if (error instanceof Base44Error) {
    console.error(`API Error: ${error.status} - ${error.message}`);
    if (error.data) {
      console.error('Error data:', JSON.stringify(error.data, null, 2));
    }
  } else {
    // For non-Base44Error, log message and name to avoid circular references
    console.error(`Error: ${error.message}`);
  }
};

// Define a test entity name - this should be configured in your Base44 app
// Default to "Todo" but allow override via environment variable
const TEST_ENTITY: string = process.env.TEST_ENTITY || "Todo";

describe('Entity operations (E2E)', () => {
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
    } else {
      console.log('Warning: No authentication token provided, tests will fail');
    }
  });

  test('should be able to filter entities', async () => {
    // Skip if no token is provided - this is kept because authentication is required
    if (!config.token) {
      console.log('Skipping test: BASE44_AUTH_TOKEN not set');
      return;
    }

    // Filter entities, limit to 10 items
    const items = await (base44.entities as any)[TEST_ENTITY].filter({}, 10);

    // Assertions
    expect(Array.isArray(items)).toBe(true);
    
    if (items.length === 0) {
      console.log(`No ${TEST_ENTITY} items found, but request succeeded`);
      return;
    }
    
    // Check that each item has an id
    items.forEach((item: any) => {
      expect(item).toHaveProperty('id');
    });
  });

  test('should be able to get a specific entity by ID', async () => {
    // Skip if no entity ID or token is provided
    if (!config.testEntityId || !config.token) {
      console.log(`Skipping test: TEST_ENTITY_ID or BASE44_AUTH_TOKEN not set for ${TEST_ENTITY}`);
      return;
    }

    const item = await (base44.entities as any)[TEST_ENTITY].get(config.testEntityId!);
    
    // Assertions
    expect(item).toBeTruthy();
    expect(item.id).toBe(config.testEntityId!);
  });

  test('should be able to perform full CRUD operations on an entity', async () => {
    // Skip if no token is provided
    if (!config.token) {
      console.log('Skipping test: BASE44_AUTH_TOKEN not set');
      return;
    }

    // Create a unique identifier for test item
    const testTitle: string = `Test Item ${Date.now()}`;
    let createdItem: any;

    // Create a new item - using generic properties that might work with most entities
    createdItem = await (base44.entities as any)[TEST_ENTITY].create({
      name: testTitle,
      title: testTitle,
      description: "Created during e2e testing",
      active: true,
      completed: false,
    });

    // Verify item was created
    expect(createdItem).toHaveProperty('id');
    
    // Try to update one of the common properties
    const updateData: any = {};
    if ('completed' in createdItem) {
      updateData.completed = true;
    } else if ('active' in createdItem) {
      updateData.active = false;
    } else {
      updateData.description = "Updated during e2e testing";
    }
    
    const updatedItem = await (base44.entities as any)[TEST_ENTITY].update(createdItem.id, updateData);

    // Verify item was updated
    expect(updatedItem.id).toBe(createdItem.id);
    
    // Get the item
    const retrievedItem = await (base44.entities as any)[TEST_ENTITY].get(createdItem.id);
    
    // Verify item can be retrieved
    expect(retrievedItem.id).toBe(createdItem.id);

    // Cleanup: Delete the item we created
    if (createdItem && createdItem.id) {
      await (base44.entities as any)[TEST_ENTITY].delete(createdItem.id);
      console.log(`Successfully deleted test ${TEST_ENTITY}`);
    }
  });
  
  test('should fail when accessing non-existent entity', async () => {
    // Skip if no token is provided
    if (!config.token) {
      console.log('Skipping test: BASE44_AUTH_TOKEN not set');
      return;
    }
    
    try {
      // This should fail with a 404 error since NonExistentEntity doesn't exist
      await (base44.entities as any).NonExistentEntity.list();
      // If we get here, the test should fail because we expected an error
      throw new Error('Expected an error but none was thrown');
    } catch (error: any) {
      // This is the expected behavior - verify it's the right kind of error
      expect(error).toBeTruthy();
      if (error instanceof Base44Error) {
        expect(error.status).toBe(404); // We expect a 404 Not Found
        console.log(`Test passed: Received expected 404 error for non-existent entity`);
      } else {
        // If it's not a Base44Error, we still want to fail
        throw new Error(`Expected a Base44Error but got: ${error}`);
      }
    }
  });
}); 