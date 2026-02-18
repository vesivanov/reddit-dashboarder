const { describe, test, expect, beforeEach } = require('@jest/globals');

process.env.SESSION_COOKIE_SECRET = 'test_secret_32_bytes_long_hex_string_123456';
process.env.NODE_ENV = 'test';

const { makeSignedCookie } = require('../../../lib/cookies');
const authStatusHandler = require('../../../lib/api-handlers/auth/status');

describe('Auth Status Endpoint', () => {
  let mockReq, mockRes;

  beforeEach(() => {
    mockReq = {
      method: 'GET',
      headers: {
        cookie: ''
      }
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis()
    };
  });

  test('returns authenticated=false when no tokens', async () => {
    await authStatusHandler(mockReq, mockRes);

    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(mockRes.json).toHaveBeenCalledWith({
      authenticated: false,
      hasAccessToken: false,
      hasRefreshToken: false
    });
  });

  test('returns authenticated=true when access token present', async () => {
    const accessCookie = makeSignedCookie('access', 'test_token');
    const cookieValue = accessCookie.split(';')[0].split('=')[1];
    mockReq.headers.cookie = `rdd_access=${cookieValue}`;

    await authStatusHandler(mockReq, mockRes);

    expect(mockRes.json).toHaveBeenCalledWith({
      authenticated: true,
      hasAccessToken: true,
      hasRefreshToken: false
    });
  });

  test('returns authenticated=true when refresh token present', async () => {
    const refreshCookie = makeSignedCookie('refresh', 'test_refresh');
    const cookieValue = refreshCookie.split(';')[0].split('=')[1];
    mockReq.headers.cookie = `rdd_refresh=${cookieValue}`;

    await authStatusHandler(mockReq, mockRes);

    expect(mockRes.json).toHaveBeenCalledWith({
      authenticated: true,
      hasAccessToken: false,
      hasRefreshToken: true
    });
  });

  test('sets no-cache headers', async () => {
    await authStatusHandler(mockReq, mockRes);

    expect(mockRes.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store, max-age=0');
  });

  test('rejects non-GET requests', async () => {
    mockReq.method = 'POST';

    await authStatusHandler(mockReq, mockRes);

    expect(mockRes.status).toHaveBeenCalledWith(405);
  });
});
