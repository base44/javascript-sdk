// Load environment variables from .env file
import dotenv from 'dotenv';
import './utils/circular-json-handler.js';
import { beforeAll, afterAll, afterEach } from 'vitest';
import { server } from './mocks/server.ts';

try {
  dotenv.config({ path: './tests/.env' });
} catch (err) {
  console.warn('dotenv package not found or .env file missing, skipping environment loading');
}

// Load circular JSON reference handler to prevent errors in Jest
try {
  console.log('Loaded circular JSON reference handler');
} catch (err) {
  console.warn('Failed to load circular JSON handler:', err.message);
}

// MSW server lifecycle
beforeAll(() => {
  server.listen({ onUnhandledRequest: 'warn' });
  console.log('Starting Base44 SDK tests...');
});

afterEach(() => {
  // Remove per-test handlers registered via server.use()
  server.resetHandlers();
});

afterAll(() => {
  server.close();
  console.log('Completed Base44 SDK tests');
});
