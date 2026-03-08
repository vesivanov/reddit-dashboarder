const { describe, test, expect, beforeEach, afterEach } = require('@jest/globals');

const { runHandler } = require('../../helpers/run-handler');
const digestHandler = require('../../../lib/api-handlers/reddit/digest');

describe('/api/reddit/digest', () => {
  beforeEach(() => {
    process.env.DIGEST_API_KEY = 'digest-secret';
    delete process.env.DIGEST_SYNC_TOKEN;
    global.fetch = jest.fn();
  });

  afterEach(() => {
    delete global.fetch;
  });

  test('requires bearer auth', async () => {
    const res = await runHandler(digestHandler, {
      method: 'GET',
      url: '/api/reddit/digest?token=sync-token',
      headers: {
        host: 'localhost:3000',
      },
    });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      error: 'Missing or invalid Authorization header. Use: Bearer <token>',
    });
  });

  test('proxies the sync payload on success', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        posts: [{ id: 'p1' }],
        syncedAt: '2026-03-08T12:00:00.000Z',
      }),
    });

    const res = await runHandler(digestHandler, {
      method: 'GET',
      url: '/api/reddit/digest?token=sync-token',
      headers: {
        authorization: 'Bearer digest-secret',
        host: 'localhost:3000',
        'x-forwarded-proto': 'https',
      },
    });

    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith('https://localhost:3000/api/sync/sync-token', {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer digest-secret',
      },
    });
    expect(res.body).toMatchObject({
      source: 'sync',
      token: 'sync-token',
      posts: [{ id: 'p1' }],
      syncedAt: '2026-03-08T12:00:00.000Z',
    });
    expect(res.body.fetchedAt).toEqual(expect.any(String));
    expect(res.body.durationMs).toEqual(expect.any(Number));
  });

  test('returns upstream errors when sync fetch fails', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => JSON.stringify({ error: 'Sync not found' }),
    });

    const res = await runHandler(digestHandler, {
      method: 'GET',
      url: '/api/reddit/digest?token=sync-token',
      headers: {
        authorization: 'Bearer digest-secret',
        host: 'localhost:3000',
        'x-forwarded-proto': 'https',
      },
    });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: 'Sync fetch failed',
      upstreamStatus: 404,
      upstream: { error: 'Sync not found' },
    });
  });

  test('returns 502 for invalid upstream JSON', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => 'not-json',
    });

    const res = await runHandler(digestHandler, {
      method: 'GET',
      url: '/api/reddit/digest?token=sync-token',
      headers: {
        authorization: 'Bearer digest-secret',
        host: 'localhost:3000',
      },
    });

    expect(res.status).toBe(502);
    expect(res.body).toEqual({
      error: 'Upstream returned invalid JSON',
      upstreamStatus: 200,
      upstreamBodyPreview: 'not-json',
    });
  });
});
