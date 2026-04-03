/**
 * Strict ES module test - runs with Node.js directly
 * This will fail if imports don't have proper .js extensions
 */
import { createClient } from './dist/index.js';

console.log('✅ ES module import successful');
console.log('createClient:', typeof createClient);

const client = createClient({
  apiKey: 'test-key',
  baseURL: 'https://api.test.com'
});

console.log('✅ Client creation successful');
process.exit(0);