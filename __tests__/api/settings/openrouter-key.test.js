const { describe, test, expect, beforeEach } = require('@jest/globals');

process.env.SESSION_COOKIE_SECRET = 'test_secret_32_bytes_long_hex_string_123456';
process.env.NODE_ENV = 'test';

const { makeSignedCookie } = require('../../../lib/cookies');
const openrouterKeyHandler = require('../../../api/settings/openrouter-key');

describe('OpenRouter Key Settings Endpoint', () => {
  let mockReq, mockRes;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReq = {
      method: 'GET',
      headers: {
        cookie: ''
      },
      body: null
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis(),
      end: jest.fn().mockReturnThis()
    };
  });

  test('GET: returns hasKey=false when no key stored', async () => {
    await openrouterKeyHandler(mockReq, mockRes);

    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(mockRes.json).toHaveBeenCalledWith({
      hasKey: false,
      keyPreview: null
    });
  });

  test('GET: returns hasKey=true with preview when key stored', async () => {
    const keyCookie = makeSignedCookie('openrouter_key', 'sk-or-v1-abcdefghijklmnopqrstuvwxyz1234567890');
    const cookieValue = keyCookie.split(';')[0].split('=')[1];
    mockReq.headers.cookie = `rdd_openrouter_key=${cookieValue}`;

    await openrouterKeyHandler(mockReq, mockRes);

    expect(mockRes.json).toHaveBeenCalledWith({
      hasKey: true,
      keyPreview: expect.stringContaining('sk-or...')
    });
  });

  test('POST: stores API key securely', async () => {
    mockReq.method = 'POST';
    mockReq.body = {
      apiKey: 'sk-or-v1-testkey12345678901234567890'
    };

    await openrouterKeyHandler(mockReq, mockRes);

    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(mockRes.setHeader).toHaveBeenCalledWith('Set-Cookie', expect.any(String));
    expect(mockRes.json).toHaveBeenCalledWith({
      success: true,
      keyPreview: expect.stringContaining('sk-or...')
    });
  });

  test('POST: rejects invalid API key format', async () => {
    mockReq.method = 'POST';
    mockReq.body = {
      apiKey: 'short'
    };

    await openrouterKeyHandler(mockReq, mockRes);

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: 'Invalid API key format'
    });
  });

  test('POST: rejects missing API key', async () => {
    mockReq.method = 'POST';
    mockReq.body = {};

    await openrouterKeyHandler(mockReq, mockRes);

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: 'apiKey is required'
    });
  });

  test('DELETE: removes stored API key', async () => {
    mockReq.method = 'DELETE';

    await openrouterKeyHandler(mockReq, mockRes);

    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(mockRes.setHeader).toHaveBeenCalledWith('Set-Cookie', expect.any(String));
    expect(mockRes.json).toHaveBeenCalledWith({
      success: true
    });
  });

  test('handles CORS preflight', async () => {
    mockReq.method = 'OPTIONS';

    await openrouterKeyHandler(mockReq, mockRes);

    expect(mockRes.status).toHaveBeenCalledWith(204);
    expect(mockRes.end).toHaveBeenCalled();
  });

  test('never returns full API key in response', async () => {
    const keyCookie = makeSignedCookie('openrouter_key', 'sk-or-v1-secretkey12345678901234567890');
    const cookieValue = keyCookie.split(';')[0].split('=')[1];
    mockReq.headers.cookie = `rdd_openrouter_key=${cookieValue}`;

    await openrouterKeyHandler(mockReq, mockRes);

    const response = mockRes.json.mock.calls[0][0];
    expect(response.keyPreview).not.toContain('secretkey');
    expect(response.keyPreview).toContain('sk-or...');
  });
});
