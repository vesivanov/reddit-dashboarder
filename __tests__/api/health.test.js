const { describe, test, expect, beforeEach, afterEach } = require('@jest/globals');

const { runHandler } = require('../helpers/run-handler');
const healthHandler = require('../../lib/api-handlers/health');

describe('/api/health', () => {
  let memoryUsageSpy;
  let uptimeSpy;

  beforeEach(() => {
    memoryUsageSpy = jest.spyOn(process, 'memoryUsage').mockReturnValue({
      rss: 1,
      heapTotal: 2,
      heapUsed: 3,
      external: 4,
      arrayBuffers: 5,
    });
    uptimeSpy = jest.spyOn(process, 'uptime').mockReturnValue(42);
  });

  afterEach(() => {
    memoryUsageSpy.mockRestore();
    uptimeSpy.mockRestore();
  });

  test('handles CORS preflight', async () => {
    const res = await runHandler(healthHandler, {
      method: 'OPTIONS',
      url: '/api/health?probe=1',
    });

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('*');
    expect(res.headers['access-control-allow-methods']).toBe('GET, OPTIONS');
  });

  test('returns health metadata for GET requests', async () => {
    const res = await runHandler(healthHandler, {
      method: 'GET',
      url: '/api/health?probe=1',
      headers: {
        'user-agent': 'jest-test',
      },
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'healthy',
      environment: expect.any(Object),
      request: {
        method: 'GET',
        url: '/api/health?probe=1',
        userAgent: 'jest-test',
        query: { probe: '1' },
      },
      server: {
        platform: process.platform,
        nodeVersion: process.version,
        memoryUsage: {
          rss: 1,
          heapTotal: 2,
          heapUsed: 3,
          external: 4,
          arrayBuffers: 5,
        },
        uptime: 42,
      },
    });
    expect(res.body.timestamp).toEqual(expect.any(String));
  });
});
