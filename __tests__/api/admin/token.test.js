const { describe, test, expect, beforeEach } = require('@jest/globals');

jest.mock('../../../lib/credential-stores/reddit-refresh-token-store', () => ({
  getTokenInfo: jest.fn(),
  saveRefreshToken: jest.fn(),
  deleteRefreshToken: jest.fn(),
  isPersistentStoreConfigured: jest.fn(),
}));

const tokenStore = require('../../../lib/credential-stores/reddit-refresh-token-store');
const { runHandler } = require('../../helpers/run-handler');
const adminTokenHandler = require('../../../lib/api-handlers/admin/token');

describe('/api/admin/token', () => {
  beforeEach(() => {
    process.env.DIGEST_API_KEY = 'digest-secret';
    delete process.env.REDDIT_REFRESH_TOKEN;
    jest.clearAllMocks();
  });

  test('GET returns token metadata for authorized requests', async () => {
    tokenStore.getTokenInfo.mockResolvedValue({
      hasToken: true,
      source: 'kv',
      updatedAt: '2026-03-08T12:00:00.000Z',
    });
    tokenStore.isPersistentStoreConfigured.mockReturnValue(true);

    const res = await runHandler(adminTokenHandler, {
      method: 'GET',
      url: '/api/admin/token',
      headers: {
        authorization: 'Bearer digest-secret',
      },
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      hasToken: true,
      source: 'kv',
      updatedAt: '2026-03-08T12:00:00.000Z',
      persistentStoreConfigured: true,
      envVarSet: false,
    });
  });

  test('POST saves a token from the request body', async () => {
    tokenStore.saveRefreshToken.mockResolvedValue({ success: true });

    const res = await runHandler(adminTokenHandler, {
      method: 'POST',
      url: '/api/admin/token',
      headers: {
        authorization: 'Bearer digest-secret',
      },
      body: {
        token: ' refresh-token ',
      },
    });

    expect(res.status).toBe(200);
    expect(tokenStore.saveRefreshToken).toHaveBeenCalledWith('refresh-token');
    expect(res.body).toEqual({
      success: true,
      message: 'Refresh token saved to persistent storage',
    });
  });

  test('DELETE removes the stored token', async () => {
    tokenStore.deleteRefreshToken.mockResolvedValue({ success: true });

    const res = await runHandler(adminTokenHandler, {
      method: 'DELETE',
      url: '/api/admin/token',
      headers: {
        authorization: 'Bearer digest-secret',
      },
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      message: 'Refresh token deleted from persistent storage',
    });
  });

  test('rejects unauthorized requests', async () => {
    const res = await runHandler(adminTokenHandler, {
      method: 'GET',
      url: '/api/admin/token',
    });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      error: 'Missing or invalid Authorization header. Use: Bearer <token>',
    });
  });
});
