/**
 * Test setup and global mocks
 * This file runs before all tests
 */

// Set test environment
process.env.NODE_ENV = 'test';
process.env.SESSION_COOKIE_SECRET = process.env.SESSION_COOKIE_SECRET || 'test_secret_32_bytes_long_hex_string_123456';

// Mock console methods to reduce noise in test output
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

// Increase timeout for integration tests
jest.setTimeout(30000); // 30 seconds
