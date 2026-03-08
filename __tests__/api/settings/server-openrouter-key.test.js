const { beforeEach, describe, expect, test } = require('@jest/globals');

jest.mock('../../../lib/credential-stores/openrouter-key-store', () => ({
  saveOpenRouterKey: jest.fn(),
  getOpenRouterKeyInfo: jest.fn(),
  deleteOpenRouterKey: jest.fn(),
}));

const {
  saveOpenRouterKey,
  getOpenRouterKeyInfo,
  deleteOpenRouterKey,
} = require('../../../lib/credential-stores/openrouter-key-store');
const handler = require('../../../lib/api-handlers/settings/server-openrouter-key');

describe('Server OpenRouter Key Settings Endpoint', () => {
  let req;
  let res;

  beforeEach(() => {
    process.env.DIGEST_API_KEY = 'digest-secret';
    jest.clearAllMocks();

    req = {
      method: 'GET',
      headers: {
        authorization: 'Bearer digest-secret',
      },
      body: null,
      on: jest.fn(),
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis(),
      end: jest.fn().mockReturnThis(),
    };
  });

  test('GET returns stored key status', async () => {
    getOpenRouterKeyInfo.mockResolvedValue({
      hasKey: true,
      source: 'persistent-store',
      keyPreview: 'sk-or...1234',
    });

    await handler(req, res);

    expect(getOpenRouterKeyInfo).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      hasKey: true,
      source: 'persistent-store',
      keyPreview: 'sk-or...1234',
    });
  });

  test('POST stores a valid key', async () => {
    req.method = 'POST';
    req.body = { apiKey: 'sk-or-v1-valid-server-side-key-1234567890' };
    saveOpenRouterKey.mockResolvedValue({ success: true });

    await handler(req, res);

    expect(saveOpenRouterKey).toHaveBeenCalledWith('sk-or-v1-valid-server-side-key-1234567890');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      keyPreview: expect.stringContaining('sk-or...'),
    });
  });

  test('DELETE removes the persisted key', async () => {
    req.method = 'DELETE';
    deleteOpenRouterKey.mockResolvedValue({ success: true });

    await handler(req, res);

    expect(deleteOpenRouterKey).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Key removed (if existed)',
    });
  });

  test('DELETE returns an error when deletion fails', async () => {
    req.method = 'DELETE';
    deleteOpenRouterKey.mockResolvedValue({ success: false, error: 'store unavailable' });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Failed to delete API key',
      message: 'store unavailable',
    });
  });

  test('rejects requests without a valid bearer token', async () => {
    req.headers.authorization = 'Bearer wrong-secret';

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Invalid API key',
    });
  });
});
