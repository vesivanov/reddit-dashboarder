const nock = require('nock');

const { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } = require('@jest/globals');

const { runHandler } = require('../../helpers/run-handler');
const { makeSignedCookie } = require('../../../lib/cookies');
const authRefreshHandler = require('../../../lib/api-handlers/auth/refresh');

describe('Auth Refresh Endpoint', () => {
  beforeAll(() => {
    process.env.REDDIT_CLIENT_ID = 'client-id';
    process.env.REDDIT_CLIENT_SECRET = 'client-secret';
    process.env.SESSION_COOKIE_SECRET = process.env.SESSION_COOKIE_SECRET || 'test_secret_32_bytes_long_hex_string_123456';
    nock.disableNetConnect();
  });

  afterAll(() => {
    nock.enableNetConnect();
  });

  beforeEach(() => {
    nock.cleanAll();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('returns 401 when no refresh token cookie is present', async () => {
    const res = await runHandler(authRefreshHandler, {
      method: 'GET',
      url: '/api/auth/refresh',
      headers: {
        origin: 'http://localhost:3000',
      },
    });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      error: 'No refresh token',
      message: 'Please authenticate with Reddit first',
    });
  });

  test('refreshes the access token and rotates cookies', async () => {
    const refreshCookie = makeSignedCookie('refresh', 'refresh-token');
    const cookieHeader = refreshCookie.split(';')[0];

    nock('https://www.reddit.com')
      .post('/api/v1/access_token')
      .reply(200, {
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        expires_in: 3600,
      });

    const res = await runHandler(authRefreshHandler, {
      method: 'GET',
      url: '/api/auth/refresh',
      headers: {
        cookie: cookieHeader,
        origin: 'http://localhost:3000',
      },
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      authenticated: true,
      expiresIn: 3600,
    });
    expect(res.headers['set-cookie']).toEqual(
      expect.arrayContaining([
        expect.stringContaining('rdd_access='),
        expect.stringContaining('rdd_refresh='),
      ])
    );
  });

  test('clears cookies when refresh fails with 401', async () => {
    const refreshCookie = makeSignedCookie('refresh', 'refresh-token');
    const cookieHeader = refreshCookie.split(';')[0];

    nock('https://www.reddit.com')
      .post('/api/v1/access_token')
      .reply(401, 'invalid_grant');

    const res = await runHandler(authRefreshHandler, {
      method: 'GET',
      url: '/api/auth/refresh',
      headers: {
        cookie: cookieHeader,
        origin: 'http://localhost:3000',
      },
    });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      error: 'Token refresh failed',
      message: 'Token refresh failed: invalid_grant',
      code: 'INVALID_REFRESH_TOKEN',
    });
    expect(res.headers['set-cookie']).toEqual(
      expect.arrayContaining([
        expect.stringContaining('rdd_access=;'),
        expect.stringContaining('rdd_refresh=;'),
      ])
    );
  });
});
