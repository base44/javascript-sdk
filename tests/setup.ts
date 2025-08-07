// Load environment variables from .env file
import dotenv from 'dotenv';
import './utils/circular-json-handler.js';
import { beforeAll, afterAll } from 'vitest';

try {
  dotenv.config({ path: './tests/.env' });
} catch (err) {
  console.warn('dotenv package not found or .env file missing, skipping environment loading');
}

// Load circular JSON reference handler to prevent errors in Jest
try {
  console.log('Loaded circular JSON reference handler');
} catch (err: any) {
  console.warn('Failed to load circular JSON handler:', err.message);
}

// Global beforeAll and afterAll hooks
beforeAll(() => {
  console.log('Starting Base44 SDK tests...');
  // Add any global setup here
});

afterAll(() => {
  console.log('Completed Base44 SDK tests');
  // Add any global teardown here
});