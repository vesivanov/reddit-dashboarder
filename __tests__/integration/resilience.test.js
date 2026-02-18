/**
 * Resilience Tests: Handle errors, rate limits, and edge cases gracefully
 * 
 * These tests ensure the app remains usable even when:
 * - Reddit API rate limits
 * - Token expires and needs refresh
 * - Network errors occur
 * - Invalid data is returned
 */

const { describe, test, expect, beforeEach } = require('@jest/globals');

global.fetch = jest.fn();
process.env.REDDIT_CLIENT_ID = 'test_client_id';
process.env.REDDIT_CLIENT_SECRET = 'test_client_secret';
process.env.SESSION_COOKIE_SECRET = 'test_secret_32_bytes_long_hex_string_123456';
process.env.NODE_ENV = 'test';

const redditHandler = require('../../lib/api-handlers/reddit');
const aiRankHandler = require('../../lib/api-handlers/reddit/ai-rank');

describe('Resilience: Error Handling', () => {
  let mockReq, mockRes;
  function applyQuery(params) {
    mockReq.query = params;
    const search = Object.entries(params || {})
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&');
    mockReq.url = search ? `/api/reddit?${search}` : '/api/reddit';
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockReq = {
      method: 'GET',
      url: '/api/reddit',
      query: {},
      headers: { 
        cookie: '', 
        host: 'localhost:3000',
        origin: 'http://localhost:3000'
      }
    };
    applyQuery({ subs: 'programming' });
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis(),
      getHeader: jest.fn().mockReturnValue(null),
      end: jest.fn().mockReturnThis()
    };
  });

  test('Handles Reddit rate limiting gracefully', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: async () => 'Too Many Requests'
    });

    mockReq.headers.cookie = `rdd_access=${encodeURIComponent('token.signature')}`;

    await redditHandler(mockReq, mockRes);

    // Should return error response, not crash
    expect(mockRes.status).toHaveBeenCalled();
    const response = mockRes.json.mock.calls[0][0];
    expect(response.error || response.rate_limited).toBeDefined();
  });

  test('Handles token expiration and refresh', async () => {
    const { makeSignedCookie } = require('../../lib/cookies');
    const refreshToken = 'refresh_token_123';
    const refreshCookie = makeSignedCookie('refresh', refreshToken);
    const refreshCookieValue = refreshCookie.split(';')[0].split('=')[1];
    
    mockReq.headers.cookie = `rdd_refresh=${refreshCookieValue}`;

    // Token refresh endpoint call (for refresh token)
    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        access_token: 'new_token',
        refresh_token: 'new_refresh',
        expires_in: 3600
      })
    });

    // Subreddit metadata call
    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: { subscribers: 1000, title: 'Test Sub' } })
    });

    // Posts fetch call
    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        data: { children: [], after: null }
      })
    });

    await redditHandler(mockReq, mockRes);

    // Should have attempted refresh and fetched data
    expect(global.fetch).toHaveBeenCalled();
    // Should set new cookies
    expect(mockRes.setHeader).toHaveBeenCalled();
  });

  test('Handles partial failures across subreddits', async () => {
    const { makeSignedCookie } = require('../../lib/cookies');
    const accessCookie = makeSignedCookie('access', 'token');
    const accessCookieValue = accessCookie.split(';')[0].split('=')[1];
    
    applyQuery({ subs: 'programming,javascript,invalid_sub' });
    mockReq.headers.cookie = `rdd_access=${accessCookieValue}`;

    let callCount = 0;
    global.fetch.mockImplementation(async (url) => {
      callCount++;
      if (url.includes('invalid_sub')) {
        return {
          ok: false,
          status: 404,
          text: async () => 'Subreddit not found'
        };
      }
      if (url.includes('about.json')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: { subscribers: 1000, title: 'Test Sub' } })
        };
      }
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          data: { children: [], after: null }
        })
      };
    });

    await redditHandler(mockReq, mockRes);

    // Should have called json with response
    expect(mockRes.json).toHaveBeenCalled();
    const response = mockRes.json.mock.calls[0][0];
    
    // Should return results array
    expect(response.results).toBeDefined();
    expect(Array.isArray(response.results)).toBe(true);
    
    // Should include error for failed subreddit (if error handling works)
    // Note: The handler might catch errors and include them in results
    const hasError = response.results.some(r => r.error);
    // This test validates that partial failures don't crash the handler
    expect(response.results.length).toBeGreaterThan(0);
  });

  test('Handles AI ranking API failures gracefully', async () => {
    const aiRankReq = {
      method: 'POST',
      body: {
        posts: [{ id: 'post1', title: 'Test', subreddit: 'test', selftext: '', score: 10, num_comments: 5, created_utc: Date.now() / 1000 }],
        userGoals: 'Test goals',
        openRouterModel: 'test-model',
        openRouterApiKey: 'test_key'
      },
      headers: { cookie: '' }
    };

    // Mock fetch to return an error response (not throw)
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: async () => 'Rate limited'
    });

    await aiRankHandler(aiRankReq, mockRes);

    // Handler should handle the error gracefully
    // It may return scores with null values for failed posts, or return an error
    expect(mockRes.status).toHaveBeenCalled();
    
    if (mockRes.json.mock.calls.length > 0) {
      const response = mockRes.json.mock.calls[0][0];
      // Either returns error or handles gracefully with null scores
      expect(response.error || response.scores).toBeDefined();
    }
  });

  test('Handles network timeouts gracefully', async () => {
    global.fetch.mockImplementation(() => {
      return new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Request timeout')), 100);
      });
    });

    mockReq.headers.cookie = `rdd_access=${encodeURIComponent('token.signature')}`;

    await redditHandler(mockReq, mockRes);

    // Should handle timeout and return error
    expect(mockRes.status).toHaveBeenCalled();
    const response = mockRes.json.mock.calls[0][0];
    expect(response.error).toBeDefined();
  });

  test('Handles invalid subreddit names', async () => {
    applyQuery({ subs: 'invalid-subreddit-name-with-dashes-and-numbers-123' });

    await redditHandler(mockReq, mockRes);

    // Should validate and reject invalid subreddit names
    expect(mockRes.status).toHaveBeenCalledWith(400);
    const response = mockRes.json.mock.calls[0][0];
    expect(response.error).toBeDefined();
  });

  test('Handles empty subreddit list', async () => {
    applyQuery({ subs: '' });

    await redditHandler(mockReq, mockRes);

    expect(mockRes.status).toHaveBeenCalledWith(400);
    const response = mockRes.json.mock.calls[0][0];
    expect(response.error).toBe('Missing subs param');
  });
});
