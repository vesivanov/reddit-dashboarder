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

// Force supertest HTTP servers to bind to loopback only (sandbox disallows 0.0.0.0)
// If port binding fails (e.g., in sandboxed environments), return a mock server
const http = require('http');
const originalListen = http.Server.prototype.listen;

// Create a mock server that supertest can use when real binding fails
function createMockHttpServer(originalServer) {
  const mockServer = {
    address: () => ({ port: 0, family: 'IPv4', address: '127.0.0.1' }),
    close: (callback) => {
      if (callback) setTimeout(callback, 0);
      return mockServer;
    },
    listen: () => mockServer,
    on: () => mockServer,
    once: () => mockServer,
    removeListener: () => mockServer,
    removeAllListeners: () => mockServer,
    setMaxListeners: () => mockServer,
    // Preserve original server properties that supertest might need
    _events: originalServer._events || {},
    _eventsCount: originalServer._eventsCount || 0,
  };
  return mockServer;
}

http.Server.prototype.listen = function (...args) {
  // Normalize arguments to always include host
  let normalizedArgs = [...args];
  if (args.length === 0) {
    normalizedArgs = [0, '127.0.0.1'];
  } else if (typeof args[0] === 'number' && (args.length === 1 || typeof args[1] !== 'string')) {
    normalizedArgs = [args[0], '127.0.0.1', ...args.slice(1)];
  } else if (typeof args[0] === 'function') {
    normalizedArgs = [0, '127.0.0.1', args[0]];
  }
  
  // Override address() immediately to prevent null returns
  const originalAddress = this.address.bind(this);
  this.address = function() {
    const addr = originalAddress();
    return addr || { port: 0, family: 'IPv4', address: '127.0.0.1' };
  };
  
  try {
    const server = originalListen.apply(this, normalizedArgs);
    // Attach error handler to prevent unhandled errors
    if (server && typeof server.on === 'function') {
      server.on('error', (err) => {
        // Silently handle port binding errors
        if (err.code === 'EPERM' || err.code === 'EACCES') {
          // address() is already overridden above
        }
      });
    }
    return server;
  } catch (err) {
    // If listen() throws synchronously, return mock server
    if (err.code === 'EPERM' || err.code === 'EACCES') {
      return createMockHttpServer(this);
    }
    throw err;
  }
};

// Increase timeout for integration tests
jest.setTimeout(30000); // 30 seconds

afterEach(async () => {
  const { clearExpiringValue } = require('../lib/rate-limit-store');
  if (typeof clearExpiringValue === 'function') {
    await clearExpiringValue('reddit:upstream-cooldown');
  }
});
