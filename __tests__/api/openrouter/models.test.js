const { describe, test, expect, beforeEach, afterEach } = require('@jest/globals');

process.env.SESSION_COOKIE_SECRET = process.env.SESSION_COOKIE_SECRET || 'test_secret_32_bytes_long_hex_string_123456';

const { makeSignedCookie } = require('../../../lib/cookies');
const { runHandler } = require('../../helpers/run-handler');
const modelsHandler = require('../../../lib/api-handlers/openrouter/models');

describe('/api/openrouter/models', () => {
  beforeEach(() => {
    delete process.env.OPENROUTER_API_KEY;
    global.fetch = jest.fn();
  });

  afterEach(() => {
    delete global.fetch;
  });

  test('returns 401 when no API key is available', async () => {
    const res = await runHandler(modelsHandler, {
      method: 'GET',
      url: '/api/openrouter/models',
    });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      error: 'OpenRouter API key required',
      message: 'Add an OpenRouter API key to load available models.',
    });
  });

  test('loads and simplifies models using the cookie key', async () => {
    const keyCookie = makeSignedCookie('openrouter_key', 'sk-or-v1-cookie-key-1234567890');
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            id: 'openai/gpt-4o-mini',
            name: 'GPT-4o Mini',
            description: 'Fast model',
            context_length: 128000,
            pricing: { prompt: '0.15', completion: '0.60' },
          },
        ],
      }),
    });

    const res = await runHandler(modelsHandler, {
      method: 'GET',
      url: '/api/openrouter/models',
      headers: {
        cookie: keyCookie.split(';')[0],
      },
    });

    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/models',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-or-v1-cookie-key-1234567890',
        }),
      })
    );
    expect(res.body.models).toEqual([
      expect.objectContaining({
        id: 'openai/gpt-4o-mini',
        name: 'GPT-4o Mini',
        description: 'Fast model',
        context_length: 128000,
      }),
    ]);
    expect(res.body.fetchedAt).toEqual(expect.any(String));
  });

  test('returns upstream errors when model loading fails', async () => {
    process.env.OPENROUTER_API_KEY = 'env-key';
    global.fetch.mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'rate limited upstream',
    });

    const res = await runHandler(modelsHandler, {
      method: 'GET',
      url: '/api/openrouter/models',
    });

    expect(res.status).toBe(429);
    expect(res.body).toEqual({
      error: 'Failed to load models',
      message: 'rate limited upstream',
    });
  });
});
