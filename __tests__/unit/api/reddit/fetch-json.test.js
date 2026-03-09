const { describe, test, expect, beforeEach, afterEach } = require('@jest/globals');

const redditHandler = require('../../../../lib/api-handlers/reddit');
const { createFetchJSON } = redditHandler;

function mockResponse({ status = 200, body = '{}', ok = true, statusText = 'OK' } = {}) {
  return {
    status,
    statusText,
    ok,
    text: async () => body,
  };
}

describe('createFetchJSON', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.resetAllMocks();
    delete global.fetch;
  });

  test('refreshes token on 401 once and succeeds', async () => {
    const tokenManager = {
      ensureToken: jest.fn()
        .mockResolvedValueOnce('expired')
        .mockResolvedValueOnce('refreshed'),
      refreshAccessToken: jest.fn().mockResolvedValue('refreshed'),
      hasRefresh: () => true,
    };

    global.fetch
      .mockResolvedValueOnce(mockResponse({ status: 401, ok: false, body: 'Unauthorized', statusText: 'Unauthorized' }))
      .mockResolvedValueOnce(mockResponse({ body: JSON.stringify({ data: 123 }) }));

    const fetchJSON = createFetchJSON(tokenManager);
    const result = await fetchJSON('https://www.reddit.com/test.json');

    expect(result).toEqual({ data: 123 });
    expect(tokenManager.refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test('throws rate-limit error when Reddit returns 429', async () => {
    const tokenManager = {
      ensureToken: jest.fn().mockResolvedValue('token'),
      refreshAccessToken: jest.fn(),
      hasRefresh: () => false,
    };

    global.fetch.mockResolvedValue(mockResponse({ status: 429, ok: false, body: 'Too Many Requests', statusText: 'Too Many Requests' }));

    const fetchJSON = createFetchJSON(tokenManager);
    await expect(fetchJSON('https://www.reddit.com/test.json')).rejects.toThrow('[RATE_LIMIT]');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('propagates not authenticated error when token missing', async () => {
    const tokenManager = {
      ensureToken: jest.fn().mockResolvedValue(null),
      refreshAccessToken: jest.fn(),
      hasRefresh: () => false,
    };

    const fetchJSON = createFetchJSON(tokenManager);
    await expect(fetchJSON('https://www.reddit.com/test.json')).rejects.toMatchObject({ code: 'NOT_AUTHENTICATED' });
  });
});
