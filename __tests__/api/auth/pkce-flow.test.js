const request = require('supertest');
const nock = require('nock');

const createApp = require('../../../app');
const { makeSignedCookie } = require('../../../lib/cookies');

function extractCookieValue(cookies, name) {
  const target = (cookies || []).find((cookie) => cookie.startsWith(`rdd_${name}=`));
  if (!target) return null;
  const raw = target.split(';')[0].split('=')[1];
  const decoded = decodeURIComponent(raw || '');
  const [value] = decoded.split('.');
  return value;
}

// Mock server for supertest - always use mock to avoid port binding issues
function createMockServer() {
  const server = {
    address: () => ({ port: 0, family: 'IPv4', address: '127.0.0.1' }),
    close: (callback) => { 
      if (callback) setTimeout(callback, 0); 
    },
    listen: () => server,
    on: () => server,
    once: () => server,
    removeListener: () => server,
  };
  return server;
}

function setupAppWithMockListen() {
  const app = createApp();
  // Always return mock server - supertest doesn't need a real listening server
  app.listen = function(...args) {
    return createMockServer();
  };
  return app;
}

describe('OAuth PKCE flow', () => {
  let app;

  beforeAll(() => {
    process.env.REDDIT_CLIENT_ID = 'client-id';
    process.env.REDDIT_CLIENT_SECRET = 'client-secret';
    process.env.REDDIT_USER_AGENT = 'jest-agent';
    process.env.APP_BASE_URL = 'http://localhost:3000';
    process.env.SESSION_COOKIE_SECRET = process.env.SESSION_COOKIE_SECRET || 'test_secret_32_bytes_long_hex_string_123456';
    nock.disableNetConnect();
    nock.enableNetConnect('127.0.0.1');
  });

  afterAll(() => {
    nock.enableNetConnect();
  });

  beforeEach(() => {
    app = setupAppWithMockListen();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  test('start endpoint sets PKCE cookies and redirects with challenge', async () => {
    const res = await request(app)
      .get('/api/auth/start')
      .set('Host', 'localhost:3000');

    expect(res.status).toBe(302);
    const cookies = res.headers['set-cookie'];
    expect(cookies.some((c) => c.startsWith('rdd_pkce_verifier='))).toBe(true);
    expect(cookies.some((c) => c.startsWith('rdd_oauth_state='))).toBe(true);
    expect(cookies.every((c) => c.includes('HttpOnly'))).toBe(true);

    const location = res.headers.location;
    expect(location).toContain('https://www.reddit.com/api/v1/authorize');
    const redirectUrl = new URL(location);
    expect(redirectUrl.searchParams.get('code_challenge')).toBeTruthy();
    expect(redirectUrl.searchParams.get('code_challenge_method')).toBe('S256');
    expect(redirectUrl.searchParams.get('state')).toBeTruthy();
  });

  test('callback rejects invalid or missing state', async () => {
    const agent = request.agent(app);
    await agent.get('/api/auth/start');

    const res = await agent.get('/api/auth/callback?code=test&state=wrong');
    expect(res.status).toBe(400);
    expect(res.text).toContain('Invalid OAuth state');
  });

  test('callback exchanges code for tokens and sets session cookies', async () => {
    const agent = request.agent(app);
    const startRes = await agent.get('/api/auth/start');
    const location = new URL(startRes.headers.location);
    const state = location.searchParams.get('state');

    nock('https://www.reddit.com')
      .post('/api/v1/access_token')
      .reply(200, {
        access_token: 'access123',
        refresh_token: 'refresh456',
        expires_in: 3600,
      });

    const res = await agent.get(`/api/auth/callback?code=abc123&state=${state}`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/');

    const cookies = res.headers['set-cookie'];
    expect(cookies.some((c) => c.startsWith('rdd_access='))).toBe(true);
    expect(cookies.some((c) => c.startsWith('rdd_refresh='))).toBe(true);
    expect(cookies.filter((c) => c.startsWith('rdd_oauth_state=')).every((c) => c.includes('Max-Age=0'))).toBe(true);
    expect(cookies.filter((c) => c.startsWith('rdd_pkce_verifier=')).every((c) => c.includes('Max-Age=0'))).toBe(true);
  });

  test('callback surfaces token exchange failures', async () => {
    const agent = request.agent(app);
    const startRes = await agent.get('/api/auth/start');
    const location = new URL(startRes.headers.location);
    const state = location.searchParams.get('state');

    nock('https://www.reddit.com')
      .post('/api/v1/access_token')
      .reply(400, 'invalid_grant');

    const res = await agent.get(`/api/auth/callback?code=abc123&state=${state}`);
    expect(res.status).toBe(500);
    expect(res.text).toContain('Token exchange failed');
  });

  test('status reflects tokens and logout clears them', async () => {
    const accessCookie = makeSignedCookie('access', 'token');
    const refreshCookie = makeSignedCookie('refresh', 'refresh');
    const cookieHeader = [accessCookie.split(';')[0], refreshCookie.split(';')[0]].join('; ');

    const statusRes = await request(app)
      .get('/api/auth/status')
      .set('Cookie', cookieHeader);

    expect(statusRes.status).toBe(200);
    expect(statusRes.body).toEqual({
      authenticated: true,
      hasAccessToken: true,
      hasRefreshToken: true,
    });

    const logoutRes = await request(app)
      .get('/api/auth/logout')
      .set('Cookie', cookieHeader);

    expect(logoutRes.status).toBe(302);
    expect(logoutRes.headers['set-cookie']).toEqual(
      expect.arrayContaining([
        expect.stringContaining('rdd_access=;'),
        expect.stringContaining('rdd_refresh=;'),
      ])
    );
  });
});
