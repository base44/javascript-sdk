/**
 * Load test configuration from environment variables
 * @returns {Object} Configuration for tests
 */
function getTestConfig() {
  const config = {
    serverUrl: process.env.BASE44_SERVER_URL || 'https://api.base44.com',
    appId: process.env.BASE44_APP_ID,
    token: process.env.BASE44_AUTH_TOKEN,
    skipE2E: process.env.SKIP_E2E_TESTS === 'true',
    todoId: process.env.TEST_TODO_ID || undefined,
  };

  // Validate required config
  if (!config.skipE2E) {
    if (!config.appId) {
      console.warn('Warning: BASE44_APP_ID not set in environment. E2E tests may fail.');
    }
    if (!config.token) {
      console.warn('Warning: BASE44_AUTH_TOKEN not set in environment. E2E tests requiring authentication may fail.');
    }
  }

  return config;
}

module.exports = {
  getTestConfig,
}; 