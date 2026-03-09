const { describe, it, expect, beforeEach, afterEach } = require('@jest/globals');

jest.mock('../../lib/rate-limit-store', () => ({
  incrementWindow: jest.fn(),
}));

jest.mock('../../lib/storage', () => ({
  get: jest.fn(),
  set: jest.fn(),
  delete: jest.fn(),
}));

const { runHandler, createMockResponse } = require('../helpers/run-handler');
const { aiRankLimiter } = require('../../lib/middleware/rate-limit');
const { incrementWindow } = require('../../lib/rate-limit-store');
const { makeSignedCookie } = require('../../lib/cookies');
const configHandler = require('../../lib/api-v1/handlers/config');
const cronRefreshHandler = require('../../api/cron/refresh-opportunities');
const notifyMeHandler = require('../../lib/api-handlers/notify-me');
const syncHandler = require('../../lib/api-handlers/sync');
const storage = require('../../lib/storage');

function flushPromises() {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('Rate Limiting', () => {
  beforeEach(() => {
    incrementWindow.mockReset();
  });

  it('limits the AI ranking endpoint and forwards allowed requests', async () => {
    incrementWindow.mockResolvedValue({
      count: 1,
      resetAt: Date.now() + 15 * 60 * 1000,
    });

    const req = {
      path: '/api/reddit/ai-rank',
      ip: '127.0.0.1',
      headers: {},
    };
    const { res, headers } = createMockResponse();
    const next = jest.fn();

    aiRankLimiter(req, res, next);
    await flushPromises();

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
    expect(headers['x-ratelimit-limit']).toBe('10');
    expect(headers['x-ratelimit-remaining']).toBe('9');
    expect(headers['x-ratelimit-reset']).toBeTruthy();
  });

  it('returns 429 when the AI ranking limit is exceeded', async () => {
    incrementWindow.mockResolvedValue({
      count: 11,
      resetAt: Date.now() + 30 * 1000,
    });

    const req = {
      path: '/api/reddit/ai-rank',
      ip: '127.0.0.1',
      headers: {},
    };
    const { res, headers } = createMockResponse();
    const next = jest.fn();

    aiRankLimiter(req, res, next);
    await flushPromises();

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(429);
    expect(headers['retry-after']).toBeTruthy();
    expect(res.body).toMatchObject({
      error: 'Too many requests',
      message: 'Too many AI ranking requests. Try again in 15 minutes.',
    });
  });
});

describe('Authentication', () => {
  beforeEach(() => {
    process.env.AGENT_API_KEY = 'test-agent-key';
    process.env.CRON_SECRET_KEY = 'test-cron-secret';
    process.env.SESSION_COOKIE_SECRET = 'test_secret_32_bytes_long_hex_string_123456';
    storage.get.mockReset();
    storage.set.mockReset();
    storage.delete.mockReset();
  });

  afterEach(() => {
    delete process.env.AGENT_API_KEY;
    delete process.env.CRON_SECRET_KEY;
    delete process.env.SESSION_COOKIE_SECRET;
  });

  it('rejects requests without a valid API key for /api/v1/* handlers', async () => {
    const res = await runHandler(configHandler, {
      method: 'GET',
      url: '/api/v1/config?token=sync-token',
      headers: {
        origin: 'http://localhost:3000',
      },
    });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(res.body.error.message).toBe('Missing Authorization header');
  });

  it('rejects invalid cron secrets', async () => {
    const res = await runHandler(cronRefreshHandler, {
      method: 'GET',
      url: '/api/cron/refresh-opportunities',
      headers: {
        origin: 'http://localhost:3000',
        'x-cron-secret': 'wrong-secret',
      },
    });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      error: 'Unauthorized',
      message: 'Provide valid X-Cron-Secret header',
    });
  });

  it('accepts a valid bearer token and reaches the protected handler', async () => {
    storage.get.mockResolvedValue(null);

    const res = await runHandler(configHandler, {
      method: 'GET',
      url: '/api/v1/config?token=sync-token',
      headers: {
        authorization: 'Bearer test-agent-key',
        origin: 'http://localhost:3000',
      },
    });

    expect(res.status).toBe(404);
    expect(storage.get).toHaveBeenCalled();
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.data).toBeNull();
    expect(res.body.timings).toBeTruthy();
  });

  it('rejects sync writes without an authenticated session or valid bearer token', async () => {
    const res = await runHandler(syncHandler, {
      method: 'POST',
      url: '/api/sync',
      headers: {
        origin: 'http://localhost:3000',
      },
      body: {
        token: 'sync-token',
        posts: [],
      },
    });

    expect(res.status).toBe(401);
    expect(storage.set).not.toHaveBeenCalled();
    expect(res.body).toEqual({
      error: 'Unauthorized',
      message: 'Sync endpoints require an authenticated session or valid bearer token.',
    });
  });

  it('accepts sync writes with an authenticated session cookie', async () => {
    storage.set.mockResolvedValue();

    const accessCookie = makeSignedCookie('access', 'access-token');
    const cookieValue = accessCookie.split(';')[0];
    const res = await runHandler(syncHandler, {
      method: 'POST',
      url: '/api/sync',
      headers: {
        origin: 'http://localhost:3000',
      },
      cookies: cookieValue,
      body: {
        token: 'sync-token',
        posts: [],
      },
    });

    expect(res.status).toBe(200);
    expect(storage.set).toHaveBeenCalled();
  });

  it('returns 413 when the sync payload is too large before storage write', async () => {
    storage.set.mockResolvedValue();

    const accessCookie = makeSignedCookie('access', 'access-token');
    const cookieValue = accessCookie.split(';')[0];
    const hugePost = {
      id: 'p1',
      title: 'x'.repeat(210000),
      selftext: '',
    };
    const res = await runHandler(syncHandler, {
      method: 'POST',
      url: '/api/sync',
      headers: {
        origin: 'http://localhost:3000',
      },
      cookies: cookieValue,
      body: {
        token: 'sync-token',
        posts: [hugePost],
      },
    });

    expect(res.status).toBe(413);
    expect(storage.set).not.toHaveBeenCalled();
    expect(res.body.error).toBe('Payload too large');
  });

  it('returns 413 when the storage backend rejects the sync payload as too large', async () => {
    storage.set.mockRejectedValueOnce(new Error('payload too large for backend'));

    const accessCookie = makeSignedCookie('access', 'access-token');
    const cookieValue = accessCookie.split(';')[0];
    const res = await runHandler(syncHandler, {
      method: 'POST',
      url: '/api/sync',
      headers: {
        origin: 'http://localhost:3000',
      },
      cookies: cookieValue,
      body: {
        token: 'sync-token',
        posts: [{ id: 'p1', title: 'small enough' }],
      },
    });

    expect(res.status).toBe(413);
    expect(res.body.error).toBe('Payload too large');
  });

  it('returns 503 when sync storage is temporarily unavailable', async () => {
    storage.set.mockRejectedValueOnce(new Error('redis unavailable'));

    const accessCookie = makeSignedCookie('access', 'access-token');
    const cookieValue = accessCookie.split(';')[0];
    const res = await runHandler(syncHandler, {
      method: 'POST',
      url: '/api/sync',
      headers: {
        origin: 'http://localhost:3000',
      },
      cookies: cookieValue,
      body: {
        token: 'sync-token',
        posts: [{ id: 'p1', title: 'small enough' }],
      },
    });

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({
      error: 'Sync unavailable',
    });
  });
});

describe('Input Validation', () => {
  beforeEach(() => {
    storage.get.mockReset();
    storage.set.mockReset();
    storage.delete.mockReset();
  });

  it('sanitizes email in waitlist submissions', async () => {
    storage.get.mockResolvedValue([]);
    storage.set.mockResolvedValue();

    const res = await runHandler(notifyMeHandler, {
      method: 'POST',
      url: '/api/notify-me',
      headers: {
        origin: 'http://localhost:3000',
      },
      body: {
        email: '  <founder@example.com>  ',
        tier: 'enterprise',
      },
    });

    expect(res.status).toBe(200);
    expect(storage.set).toHaveBeenCalledTimes(1);
    expect(storage.set.mock.calls[0][0]).toBe('pro-waitlist');
    expect(storage.set.mock.calls[0][1][0]).toMatchObject({
      email: 'founder@example.com',
      tier: 'enterprise',
    });
  });

  it('normalizes invalid tier values to pro', async () => {
    storage.get.mockResolvedValue([]);
    storage.set.mockResolvedValue();

    const res = await runHandler(notifyMeHandler, {
      method: 'POST',
      url: '/api/notify-me',
      body: {
        email: 'founder@example.com',
        tier: 'vip',
      },
    });

    expect(res.status).toBe(200);
    expect(storage.set.mock.calls[0][1][0]).toMatchObject({
      email: 'founder@example.com',
      tier: 'pro',
    });
  });

  it('limits waitlist size', async () => {
    storage.get.mockResolvedValue(new Array(10000).fill({ email: 'taken@example.com' }));

    const res = await runHandler(notifyMeHandler, {
      method: 'POST',
      url: '/api/notify-me',
      body: {
        email: 'new@example.com',
        tier: 'pro',
      },
    });

    expect(res.status).toBe(503);
    expect(storage.set).not.toHaveBeenCalled();
    expect(res.body).toEqual({
      error: 'Waitlist full',
      message: 'Our waitlist is currently full. Please try again later.',
    });
  });
});

describe('CORS', () => {
  it('allows requests from allowed origins', async () => {
    const res = await runHandler(notifyMeHandler, {
      method: 'OPTIONS',
      url: '/api/notify-me',
      headers: {
        origin: 'http://localhost:3000',
      },
    });

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(res.headers['access-control-allow-methods']).toBe('POST, OPTIONS');
  });

  it('blocks requests from unknown origins', async () => {
    const res = await runHandler(notifyMeHandler, {
      method: 'OPTIONS',
      url: '/api/notify-me',
      headers: {
        origin: 'https://evil.example.com',
      },
    });

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    expect(res.headers['access-control-allow-methods']).toBe('POST, OPTIONS');
  });
});
