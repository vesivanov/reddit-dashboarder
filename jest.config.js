module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js', '**/*.test.js'],
  testPathIgnorePatterns: ['/node_modules/'],
  collectCoverageFrom: [
    'api/**/*.js',
    'lib/**/*.js',
    '!**/node_modules/**',
    '!**/__tests__/**'
  ],
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/__tests__/'
  ],
  setupFilesAfterEnv: ['<rootDir>/__tests__/setup.js'],
  testTimeout: 30000,
  verbose: true,
  // Don't transform node_modules except for specific packages if needed
  transformIgnorePatterns: [
    'node_modules/(?!(.*\\.mjs$))'
  ]
};
