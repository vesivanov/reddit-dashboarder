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
const snapshotHandler = require('../../lib/api-v1/handlers/snapshot');
const workspacesHandler = require('../../lib/api-handlers/workspaces');
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

  it('rejects requests without a valid bearer token for agent-only endpoints', async () => {
    const res = await runHandler(require('../../lib/api-v1/handlers/jobs'), {
      method: 'POST',
      url: '/api/v1/jobs/drain',
      headers: {
        origin: 'http://localhost:3000',
      },
    });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(res.body.error.message).toBe('Missing Authorization header');
  });

  it('accepts a valid bearer token and reaches the protected handler', async () => {
    const jobsHandler = require('../../lib/api-v1/handlers/jobs');
    const res = await runHandler(jobsHandler, {
      method: 'POST',
      url: '/api/v1/jobs/drain',
      headers: {
        authorization: 'Bearer test-agent-key',
        origin: 'http://localhost:3000',
      },
    });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('processed');
    expect(res.body.timings).toBeTruthy();
  });

  it('rejects workspace bootstrap without an authenticated session or valid bearer token', async () => {
    const res = await runHandler(workspacesHandler, {
      method: 'POST',
      url: '/api/workspaces',
      headers: {
        origin: 'http://localhost:3000',
      },
      body: {
        token: 'sync-token',
      },
    });

    expect(res.status).toBe(401);
    expect(storage.set).not.toHaveBeenCalled();
    expect(res.body).toEqual({
      error: 'Unauthorized',
      message: 'Workspace bootstrap requires an authenticated session or valid bearer token.',
    });
  });

  it('accepts workspace bootstrap with an authenticated session cookie', async () => {
    storage.set.mockResolvedValue();

    const accessCookie = makeSignedCookie('access', 'access-token');
    const cookieValue = accessCookie.split(';')[0];
    const res = await runHandler(workspacesHandler, {
      method: 'POST',
      url: '/api/workspaces',
      headers: {
        origin: 'http://localhost:3000',
      },
      cookies: cookieValue,
      body: {
        token: 'sync-token',
      },
    });

    expect(res.status).toBe(200);
    expect(storage.set).toHaveBeenCalled();
  });

  it('returns 413 when the workspace snapshot payload is too large before storage write', async () => {
    storage.set.mockResolvedValue();

    const accessCookie = makeSignedCookie('access', 'access-token');
    const cookieValue = accessCookie.split(';')[0];
    const hugePost = {
      id: 'p1',
      title: 'x'.repeat(210000),
      selftext: '',
    };
    const res = await runHandler(snapshotHandler, {
      method: 'PUT',
      url: '/api/workspaces/ws_demo/snapshot',
      headers: {
        origin: 'http://localhost:3000',
      },
      cookies: cookieValue,
      params: { workspaceId: 'ws_demo' },
      body: {
        token: 'sync-token',
        posts: [hugePost],
        settings: {},
        filters: {},
      },
    });

    expect(res.status).toBe(413);
    expect(storage.set).not.toHaveBeenCalled();
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 413 when the storage backend rejects the workspace snapshot payload as too large', async () => {
    storage.set.mockRejectedValueOnce(new Error('payload too large for backend'));

    const accessCookie = makeSignedCookie('access', 'access-token');
    const cookieValue = accessCookie.split(';')[0];
    const res = await runHandler(snapshotHandler, {
      method: 'PUT',
      url: '/api/workspaces/ws_demo/snapshot',
      headers: {
        origin: 'http://localhost:3000',
      },
      cookies: cookieValue,
      params: { workspaceId: 'ws_demo' },
      body: {
        token: 'sync-token',
        posts: [{ id: 'p1', title: 'small enough' }],
        settings: {},
        filters: {},
      },
    });

    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 503 when workspace snapshot storage is temporarily unavailable', async () => {
    storage.set.mockRejectedValueOnce(new Error('redis unavailable'));

    const accessCookie = makeSignedCookie('access', 'access-token');
    const cookieValue = accessCookie.split(';')[0];
    const res = await runHandler(snapshotHandler, {
      method: 'PUT',
      url: '/api/workspaces/ws_demo/snapshot',
      headers: {
        origin: 'http://localhost:3000',
      },
      cookies: cookieValue,
      params: { workspaceId: 'ws_demo' },
      body: {
        token: 'sync-token',
        posts: [{ id: 'p1', title: 'small enough' }],
        settings: {},
        filters: {},
      },
    });

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
  });
});

describe('CORS', () => {
  it('allows requests from allowed origins', async () => {
    const res = await runHandler(snapshotHandler, {
      method: 'OPTIONS',
      url: '/api/workspaces/ws_demo/snapshot',
      params: { workspaceId: 'ws_demo' },
      headers: {
        origin: 'http://localhost:3000',
        'access-control-request-method': 'PUT',
      },
    });

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
  });

  it('blocks requests from unknown origins', async () => {
    const res = await runHandler(snapshotHandler, {
      method: 'OPTIONS',
      url: '/api/workspaces/ws_demo/snapshot',
      params: { workspaceId: 'ws_demo' },
      headers: {
        origin: 'https://evil.example.com',
        'access-control-request-method': 'PUT',
      },
    });

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
