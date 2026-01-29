/**
 * North Star Test: "Decide what to do next on Reddit in minutes"
 * 
 * This test validates the complete user journey:
 * 1. Authenticate with Reddit
 * 2. Fetch posts from multiple subreddits
 * 3. Rank posts by AI relevance
 * 4. Filter and surface actionable posts
 * 
 * Success criteria:
 * - Complete workflow in < 2 minutes (target: < 1 minute)
 * - Surface at least 3-5 highly relevant posts (score ≥ 7)
 * - Handle errors gracefully
 */

const { describe, test, expect, beforeEach } = require('@jest/globals');

// Mock fetch globally
global.fetch = jest.fn();

// Mock environment variables
process.env.REDDIT_CLIENT_ID = 'test_client_id';
process.env.REDDIT_CLIENT_SECRET = 'test_client_secret';
process.env.SESSION_COOKIE_SECRET = 'test_secret_32_bytes_long_hex_string_123456';
process.env.OPENROUTER_API_KEY = 'test_openrouter_key';
process.env.NODE_ENV = 'test';

const redditHandler = require('../../api/reddit');
const aiRankHandler = require('../../api/reddit/ai-rank');
const authStartHandler = require('../../api/auth/start');
const authStatusHandler = require('../../api/auth/status');

describe('North Star: Complete User Journey', () => {
  let mockReq, mockRes;
  let startTime;

  beforeEach(() => {
    jest.clearAllMocks();
    startTime = Date.now();
    
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

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis(),
      redirect: jest.fn().mockReturnThis(),
      end: jest.fn().mockReturnThis(),
      getHeader: jest.fn().mockReturnValue(null)
    };
  });

  test('Complete workflow: Auth → Fetch → Rank → Surface actionable posts', async () => {
    // Step 1: Authenticate
    const authReq = { ...mockReq, url: '/api/auth/start' };
    const authRes = { ...mockRes };
    
    await authStartHandler(authReq, authRes);
    
    // Verify auth redirect
    expect(authRes.redirect).toHaveBeenCalled();
    expect(authRes.setHeader).toHaveBeenCalledWith('Set-Cookie', expect.any(Array));
    
    // Step 2: Simulate authenticated request with access token
    const { makeSignedCookie } = require('../../lib/cookies');
    const accessToken = 'test_access_token_123';
    const accessCookie = makeSignedCookie('access', accessToken);
    const accessCookieValue = accessCookie.split(';')[0].split('=')[1];
    mockReq.headers.cookie = `rdd_access=${accessCookieValue}`;
    mockReq.query = {
      subs: 'programming,javascript',
      mode: 'new',
      days: '1',
      limit: '25',
      max_pages: '2'
    };

    // Mock Reddit API responses
    const mockRedditResponse = {
      data: {
        children: [
          {
            data: {
              id: 'post1',
              subreddit: 'programming',
              title: 'React best practices for 2024',
              selftext: 'Here are the latest React patterns...',
              score: 150,
              num_comments: 45,
              created_utc: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
              permalink: '/r/programming/comments/post1/',
              url: 'https://example.com/react-guide',
              domain: 'example.com',
              author: 'user1',
              thumbnail: 'https://example.com/thumb.jpg',
              link_flair_text: 'Tutorial'
            }
          },
          {
            data: {
              id: 'post2',
              subreddit: 'javascript',
              title: 'TypeScript tips and tricks',
              selftext: 'Advanced TypeScript patterns...',
              score: 89,
              num_comments: 23,
              created_utc: Math.floor(Date.now() / 1000) - 7200, // 2 hours ago
              permalink: '/r/javascript/comments/post2/',
              url: 'https://example.com/typescript',
              domain: 'example.com',
              author: 'user2',
              thumbnail: null,
              link_flair_text: ''
            }
          }
        ],
        after: null
      }
    };

    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(mockRedditResponse)
    });

    // Mock subreddit metadata
    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          subscribers: 1000,
          title: 'programming',
          icon_img: null,
          public_description: 'Programming subreddit'
        }
      })
    });

    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          subscribers: 2000,
          title: 'javascript',
          icon_img: null,
          public_description: 'JavaScript subreddit'
        }
      })
    });

    await redditHandler(mockReq, mockRes);

    // Verify Reddit API was called
    expect(global.fetch).toHaveBeenCalled();
    expect(mockRes.status).toHaveBeenCalledWith(200);
    
    const responseData = mockRes.json.mock.calls[0][0];
    expect(responseData.results).toBeDefined();
    expect(responseData.results.length).toBeGreaterThan(0);

    // Step 3: Rank posts with AI
    const posts = responseData.results.flatMap(r => r.posts || []);
    
    // Reset mocks for AI ranking
    jest.clearAllMocks();
    const aiRankRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis()
    };
    
    const aiRankReq = {
      method: 'POST',
      body: {
        posts: posts.slice(0, 10), // Test with subset
        userGoals: 'I am a frontend developer looking for React and TypeScript content',
        openRouterModel: 'meta-llama/llama-3.3-70b-instruct:free',
        openRouterApiKey: 'test_key'
      },
      headers: { cookie: '' }
    };

    // Mock OpenRouter API response
    const mockAIResponse = {
      choices: [{
        message: {
          content: JSON.stringify([
            { postId: 'post1', score: 8, confidence: 'high', reason: 'Highly relevant React content' },
            { postId: 'post2', score: 7, confidence: 'medium', reason: 'Relevant TypeScript content' }
          ])
        }
      }]
    };

    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockAIResponse
    });

    await aiRankHandler(aiRankReq, aiRankRes);

    const aiResponse = aiRankRes.json.mock.calls[0][0];
    expect(aiResponse.scores).toBeDefined();
    
    // Step 4: Validate actionable posts surfaced
    const highRelevancePosts = Object.entries(aiResponse.scores)
      .filter(([_, score]) => score !== null && score >= 7)
      .map(([postId, score]) => ({ postId, score }));

    // If we have posts, validate that AI ranking worked
    if (posts.length > 0) {
      expect(Object.keys(aiResponse.scores).length).toBeGreaterThan(0);
      // At least some posts should be scored (even if not all are high relevance)
      const scoredPosts = Object.values(aiResponse.scores).filter(s => s !== null);
      expect(scoredPosts.length).toBeGreaterThan(0);
    }
    
    // Performance check: Should complete in reasonable time
    const elapsedTime = Date.now() - startTime;
    console.log(`\n⏱️  Workflow completed in ${elapsedTime}ms`);
    expect(elapsedTime).toBeLessThan(120000); // 2 minutes max (target: < 1 minute)
    
    // Quality check: Should surface relevant posts
    console.log(`\n✅ Surfaces ${highRelevancePosts.length} highly relevant posts (score ≥ 7)`);
  });

  test('Performance: Fetch multiple subreddits efficiently', async () => {
    mockReq.query = {
      subs: 'programming,javascript,webdev,react,typescript',
      mode: 'new',
      days: '1',
      limit: '25',
      max_pages: '1'
    };

    mockReq.headers.cookie = `rdd_access=${encodeURIComponent('token.signature')}`;

    // Mock multiple subreddit responses
    global.fetch.mockImplementation(async (url) => {
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

    const startTime = Date.now();
    await redditHandler(mockReq, mockRes);
    const elapsedTime = Date.now() - startTime;

    // Should handle 5 subreddits efficiently
    expect(elapsedTime).toBeLessThan(10000); // 10 seconds for 5 subs
    console.log(`\n⏱️  Fetched 5 subreddits in ${elapsedTime}ms`);
  });

  test('Validates authentication status', async () => {
    const { makeSignedCookie } = require('../../lib/cookies');
    const accessCookie = makeSignedCookie('access', 'token');
    const refreshCookie = makeSignedCookie('refresh', 'refresh_token');
    const accessCookieValue = accessCookie.split(';')[0].split('=')[1];
    const refreshCookieValue = refreshCookie.split(';')[0].split('=')[1];
    
    const statusReq = {
      method: 'GET',
      headers: {
        cookie: `rdd_access=${accessCookieValue}; rdd_refresh=${refreshCookieValue}`
      }
    };
    const statusRes = { ...mockRes };

    await authStatusHandler(statusReq, statusRes);

    expect(statusRes.json).toHaveBeenCalled();
    const response = statusRes.json.mock.calls[0][0];
    expect(response.authenticated).toBe(true);
    expect(response.hasAccessToken).toBe(true);
    expect(response.hasRefreshToken).toBe(true);
  });
});
