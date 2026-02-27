const { describe, test, expect, beforeEach } = require('@jest/globals');

process.env.REDDIT_CLIENT_ID = 'test_client_id';
process.env.SESSION_COOKIE_SECRET = 'test_secret_32_bytes_long_hex_string_123456';
process.env.NODE_ENV = 'test';

const authStartHandler = require('../../../lib/api-handlers/auth/start');

describe('Auth Start Endpoint', () => {
  let mockReq, mockRes;

  beforeEach(() => {
    delete process.env.REDDIT_REDIRECT_URI;
    delete process.env.APP_BASE_URL;
    mockReq = {
      method: 'GET',
      headers: {
        host: 'localhost:3000',
        'x-forwarded-proto': 'http'
      }
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis(),
      redirect: jest.fn().mockReturnThis()
    };
  });

  test('initiates OAuth flow with PKCE', async () => {
    await authStartHandler(mockReq, mockRes);

    expect(mockRes.setHeader).toHaveBeenCalledWith('Set-Cookie', expect.any(Array));
    const cookies = mockRes.setHeader.mock.calls[0][1];
    expect(cookies.length).toBeGreaterThanOrEqual(2);

    expect(mockRes.redirect).toHaveBeenCalled();
    const redirectUrl = mockRes.redirect.mock.calls[0][0];
    expect(redirectUrl).toContain('reddit.com');
    expect(redirectUrl).toContain('client_id=test_client_id');
    expect(redirectUrl).toContain('code_challenge');
    expect(redirectUrl).toContain('code_challenge_method=S256');
  });

  test('rejects non-GET requests', async () => {
    mockReq.method = 'POST';

    await authStartHandler(mockReq, mockRes);

    expect(mockRes.status).toHaveBeenCalledWith(405);
  });

  test('handles missing client ID', async () => {
    delete process.env.REDDIT_CLIENT_ID;

    await authStartHandler(mockReq, mockRes);

    expect(mockRes.status).toHaveBeenCalledWith(500);
    expect(mockRes.send).toHaveBeenCalledWith('Missing Reddit OAuth configuration');

    process.env.REDDIT_CLIENT_ID = 'test_client_id';
  });

  test('constructs correct redirect URI', async () => {
    await authStartHandler(mockReq, mockRes);

    const redirectUrl = mockRes.redirect.mock.calls[0][0];
    expect(redirectUrl).toContain('redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fapi%2Fauth%2Fcallback');
  });

  test('handles HTTPS in production', async () => {
    mockReq.headers['x-forwarded-proto'] = 'https';
    mockReq.headers.host = 'reddit-dashboarder.vercel.app';

    await authStartHandler(mockReq, mockRes);

    const redirectUrl = mockRes.redirect.mock.calls[0][0];
    expect(redirectUrl).toContain('redirect_uri=https%3A%2F%2Freddit-dashboarder.vercel.app%2Fapi%2Fauth%2Fcallback');
  });

  test('does not mark state cookies as Secure on localhost http even if env has https redirects', async () => {
    process.env.REDDIT_REDIRECT_URI = 'https://reddit-dashboarder.vercel.app/api/auth/callback,http://localhost:3000/api/auth/callback';

    await authStartHandler(mockReq, mockRes);

    const cookies = mockRes.setHeader.mock.calls[0][1];
    expect(cookies[0]).not.toContain('Secure');
    expect(cookies[1]).not.toContain('Secure');
  });

  test('marks state cookies as Secure on https', async () => {
    mockReq.headers['x-forwarded-proto'] = 'https';
    mockReq.headers.host = 'reddit-dashboarder.vercel.app';

    await authStartHandler(mockReq, mockRes);

    const cookies = mockRes.setHeader.mock.calls[0][1];
    expect(cookies[0]).toContain('Secure');
    expect(cookies[1]).toContain('Secure');
  });
});
