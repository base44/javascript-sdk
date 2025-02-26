export default {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.js?(x)', '**/tests/**/*.test.js?(x)'],
  collectCoverage: true,
  collectCoverageFrom: ['src/**/*.js'],
  coverageDirectory: 'coverage',
  transform: {
    '^.+\\.(js|jsx)$': 'babel-jest',
  },
  setupFilesAfterEnv: ['./tests/setup.js'],
  testTimeout: 30000, // 30 seconds timeout for e2e tests
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
}; 