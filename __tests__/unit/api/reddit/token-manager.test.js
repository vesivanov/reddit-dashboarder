const { describe, test, expect, beforeEach, afterEach } = require('@jest/globals');

process.env.SESSION_COOKIE_SECRET = 'test_secret_32_bytes_long_hex_string_123456';
process.env.REDDIT_CLIENT_ID = 'client_id';
process.env.REDDIT_CLIENT_SECRET = 'client_secret';

const redditHandler = require('../../../../api/reddit');
const { createTokenManager } = redditHandler;
const { makeSignedCookie } = require('../../../../lib/cookies');

function attachCookie(req, cookie) {
  const pair = cookie.split(';')[0];
  if (req.headers.cookie) {
    req.headers.cookie += `; ${pair}`;
  } else {
    req.headers.cookie = pair;
  }
}

describe('createTokenManager', () => {
  let req;
  let res;

  beforeEach(() => {
    req = { headers: { cookie: '' } };
    res = {
      setHeader: jest.fn(),
      getHeader: jest.fn().mockReturnValue(null),
    };
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.resetAllMocks();
    delete global.fetch;
  });

  test('returns existing access token without refresh', async () => {
    const accessCookie = makeSignedCookie('access', 'token123');
    attachCookie(req, accessCookie);

    const manager = createTokenManager(req, res);
    await expect(manager.ensureToken()).resolves.toBe('token123');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('deduplicates concurrent refresh operations', async () => {
    const refreshCookie = makeSignedCookie('refresh', 'refresh123');
    attachCookie(req, refreshCookie);

    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ access_token: 'new_token', refresh_token: 'new_refresh', expires_in: 3600 }),
    });

    const manager = createTokenManager(req, res);

    const [tokenA, tokenB] = await Promise.all([
      manager.refreshAccessToken(),
      manager.refreshAccessToken(),
    ]);

    expect(tokenA).toBe('new_token');
    expect(tokenB).toBe('new_token');
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(res.setHeader).toHaveBeenCalled();
  });

  test('clears cookies when refresh fails', async () => {
    const refreshCookie = makeSignedCookie('refresh', 'refresh123');
    attachCookie(req, refreshCookie);

    global.fetch.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    });

    const manager = createTokenManager(req, res);

    await expect(manager.refreshAccessToken()).rejects.toThrow('Refresh token request failed');
    const cookieCalls = res.setHeader.mock.calls.filter(call => call[0] === 'Set-Cookie');
    expect(cookieCalls).not.toHaveLength(0);
    cookieCalls.forEach(([, value]) => {
      const serialized = Array.isArray(value) ? value.join(';') : String(value);
      expect(serialized).toContain('Max-Age=0');
    });
  });
});
