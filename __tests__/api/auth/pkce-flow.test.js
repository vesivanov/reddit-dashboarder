const nock = require('nock');

const { runHandler } = require('../../helpers/run-handler');
const authStartHandler = require('../../../lib/api-handlers/auth/start');
const authCallbackHandler = require('../../../lib/api-handlers/auth/callback');
const authStatusHandler = require('../../../lib/api-handlers/auth/status');
const authLogoutHandler = require('../../../lib/api-handlers/auth/logout');
const { makeSignedCookie } = require('../../../lib/cookies');

function updateCookieJar(jar, res) {
  const setCookie = res.headers['set-cookie'];
  if (!setCookie) return jar;
  const entries = Array.isArray(setCookie) ? setCookie : [setCookie];
  entries.forEach(raw => {
    const [pair, ...attrs] = raw.split(';');
    const eqIndex = pair.indexOf('=');
    const name = pair.slice(0, eqIndex).trim();
    const value = pair.slice(eqIndex + 1);
    const maxAgeAttr = attrs.find(attr => attr.trim().toLowerCase().startsWith('max-age'));
    const isDeletion = maxAgeAttr && maxAgeAttr.trim().toLowerCase().startsWith('max-age=0');
    if (isDeletion) {
      jar.delete(name.trim());
    } else {
      jar.set(name.trim(), value);
    }
  });
  return jar;
}

function cookieHeaderFromJar(jar) {
  if (!jar || jar.size === 0) return undefined;
  return Array.from(jar.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
}

describe('OAuth PKCE flow', () => {
  beforeAll(() => {
    process.env.REDDIT_CLIENT_ID = 'client-id';
    process.env.REDDIT_CLIENT_SECRET = 'client-secret';
    process.env.REDDIT_USER_AGENT = 'jest-agent';
    process.env.APP_BASE_URL = 'http://localhost:3000';
    process.env.SESSION_COOKIE_SECRET = process.env.SESSION_COOKIE_SECRET || 'test_secret_32_bytes_long_hex_string_123456';
    nock.disableNetConnect();
  });

  afterAll(() => {
    nock.enableNetConnect();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  test('start endpoint sets PKCE cookies and redirects with challenge', async () => {
    const jar = new Map();
    const res = await runHandler(authStartHandler, {
      method: 'GET',
      url: '/api/auth/start',
      headers: { host: 'localhost:3000', 'x-forwarded-proto': 'http' }
    });

    expect(res.status).toBe(302);
    const cookies = res.headers['set-cookie'];
    expect(Array.isArray(cookies)).toBe(true);
    expect(cookies.some((c) => c.startsWith('rdd_pkce_verifier='))).toBe(true);
    expect(cookies.some((c) => c.startsWith('rdd_oauth_state='))).toBe(true);
    expect(cookies.every((c) => c.includes('HttpOnly'))).toBe(true);

    updateCookieJar(jar, res);
    const location = res.headers.location;
    expect(location).toContain('https://www.reddit.com/api/v1/authorize');
    const redirectUrl = new URL(location);
    expect(redirectUrl.searchParams.get('code_challenge')).toBeTruthy();
    expect(redirectUrl.searchParams.get('code_challenge_method')).toBe('S256');
    expect(redirectUrl.searchParams.get('state')).toBeTruthy();
  });

  test('callback rejects invalid or missing state', async () => {
    const jar = new Map();
    const startRes = await runHandler(authStartHandler, {
      method: 'GET',
      url: '/api/auth/start',
      headers: { host: 'localhost:3000' }
    });
    updateCookieJar(jar, startRes);

    const res = await runHandler(authCallbackHandler, {
      method: 'GET',
      url: '/api/auth/callback?code=test&state=wrong',
      headers: { cookie: cookieHeaderFromJar(jar) }
    });
    expect(res.status).toBe(400);
    expect(res.body).toContain('Invalid OAuth state');
  });

  test('callback exchanges code for tokens and sets session cookies', async () => {
    const jar = new Map();
    const startRes = await runHandler(authStartHandler, {
      method: 'GET',
      url: '/api/auth/start',
      headers: { host: 'localhost:3000' }
    });
    updateCookieJar(jar, startRes);
    const location = new URL(startRes.headers.location);
    const state = location.searchParams.get('state');

    nock('https://www.reddit.com')
      .post('/api/v1/access_token')
      .reply(200, {
        access_token: 'access123',
        refresh_token: 'refresh456',
        expires_in: 3600,
      });

    const res = await runHandler(authCallbackHandler, {
      method: 'GET',
      url: `/api/auth/callback?code=abc123&state=${state}`,
      headers: { cookie: cookieHeaderFromJar(jar), host: 'localhost:3000' }
    });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/');

    const cookies = res.headers['set-cookie'];
    expect(cookies.some((c) => c.startsWith('rdd_access='))).toBe(true);
    expect(cookies.some((c) => c.startsWith('rdd_refresh='))).toBe(true);
    expect(cookies.filter((c) => c.startsWith('rdd_oauth_state=')).every((c) => c.includes('Max-Age=0'))).toBe(true);
    expect(cookies.filter((c) => c.startsWith('rdd_pkce_verifier=')).every((c) => c.includes('Max-Age=0'))).toBe(true);
  });

  test('callback surfaces token exchange failures', async () => {
    const jar = new Map();
    const startRes = await runHandler(authStartHandler, {
      method: 'GET',
      url: '/api/auth/start',
      headers: { host: 'localhost:3000' }
    });
    updateCookieJar(jar, startRes);
    const location = new URL(startRes.headers.location);
    const state = location.searchParams.get('state');

    nock('https://www.reddit.com')
      .post('/api/v1/access_token')
      .reply(400, 'invalid_grant');

    const res = await runHandler(authCallbackHandler, {
      method: 'GET',
      url: `/api/auth/callback?code=abc123&state=${state}`,
      headers: { cookie: cookieHeaderFromJar(jar), host: 'localhost:3000' }
    });
    expect(res.status).toBe(500);
    expect(res.body).toContain('Token exchange failed');
  });

  test('status reflects tokens and logout clears them', async () => {
    const accessCookie = makeSignedCookie('access', 'token');
    const refreshCookie = makeSignedCookie('refresh', 'refresh');
    const cookieHeader = [accessCookie.split(';')[0], refreshCookie.split(';')[0]].join('; ');

    const statusRes = await runHandler(authStatusHandler, {
      method: 'GET',
      url: '/api/auth/status',
      headers: { cookie: cookieHeader }
    });

    expect(statusRes.status).toBe(200);
    expect(statusRes.body).toEqual({
      authenticated: true,
      hasAccessToken: true,
      hasRefreshToken: true,
    });

    const logoutRes = await runHandler(authLogoutHandler, {
      method: 'GET',
      url: '/api/auth/logout',
      headers: { cookie: cookieHeader }
    });

    expect(logoutRes.status).toBe(302);
    expect(logoutRes.headers['set-cookie']).toEqual(
      expect.arrayContaining([
        expect.stringContaining('rdd_access=;'),
        expect.stringContaining('rdd_refresh=;'),
      ])
    );
  });
});
