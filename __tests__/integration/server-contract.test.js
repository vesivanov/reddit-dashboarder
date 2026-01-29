const { describe, test, expect, beforeEach, afterEach } = require('@jest/globals');

process.env.SESSION_COOKIE_SECRET = 'test_secret_32_bytes_long_hex_string_123456';
process.env.REDDIT_CLIENT_ID = 'client-id';
process.env.REDDIT_CLIENT_SECRET = 'client-secret';
process.env.REDDIT_USER_AGENT = 'reddit-dashboarder-test/1.0';

const { runHandler } = require('../helpers/run-handler');
const redditHandler = require('../../api/reddit');
const aiRankHandler = require('../../api/reddit/ai-rank');
const { makeSignedCookie } = require('../../lib/cookies');

function mockJsonResponse(body, status = 200) {
  const textBody = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'ERR',
    text: async () => textBody,
    json: async () => (typeof body === 'string' ? JSON.parse(body) : body),
  };
}

describe('Express contract tests (handler-level)', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    delete global.fetch;
  });

  test('GET /api/reddit returns normalized payload and metrics header', async () => {
    const accessCookie = makeSignedCookie('access', 'token123');
    const cookieHeader = accessCookie.split(';')[0];

    const responses = [
      mockJsonResponse({ data: { subscribers: 100, title: 'Programming', icon_img: null, public_description: 'Test sub' } }),
      mockJsonResponse({
        data: {
          children: [
            {
              data: {
                id: 'abc',
                subreddit: 'programming',
                title: 'Test Post',
                selftext: 'Body',
                score: 50,
                num_comments: 5,
                created_utc: Math.floor(Date.now() / 1000),
                permalink: '/r/programming/comments/abc',
                url: 'https://example.com/test',
                domain: 'example.com',
                author: 'user',
                thumbnail: null,
                link_flair_text: '',
              },
            },
          ],
          after: null,
        },
      }),
    ];

    global.fetch.mockImplementation(() => {
      if (!responses.length) {
        throw new Error('Unexpected fetch call');
      }
      return responses.shift();
    });

    const res = await runHandler(redditHandler, {
      method: 'GET',
      url: '/api/reddit?subs=programming&mode=top&limit=25',
      headers: {
        cookie: cookieHeader,
        origin: 'http://localhost:3000',
      },
    });

    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(1);
    expect(res.body.results[0].posts).toHaveLength(1);
    expect(res.body.metrics).toMatchObject({ subredditCount: 1, totalPosts: 1 });
    expect(res.headers['x-rdd-metrics']).toBeDefined();
    expect(() => JSON.parse(res.headers['x-rdd-metrics'])).not.toThrow();
  });

  test('POST /api/reddit/ai-rank returns scores and metrics header', async () => {
    const posts = [
      { id: 'p1', title: 'React news', subreddit: 'reactjs', selftext: '', score: 10, num_comments: 2, created_utc: Math.floor(Date.now() / 1000) },
      { id: 'p2', title: 'Other', subreddit: 'random', selftext: '', score: 5, num_comments: 1, created_utc: Math.floor(Date.now() / 1000) },
    ];

    const openRouterPayload = {
      choices: [{ message: { content: JSON.stringify([{ postId: 'p1', score: 5, confidence: 'high', reason: 'Relevant' }]) } }],
    };

    global.fetch.mockResolvedValue(mockJsonResponse(openRouterPayload));

    const res = await runHandler(aiRankHandler, {
      method: 'POST',
      url: '/api/reddit/ai-rank',
      headers: { origin: 'http://localhost:3000' },
      body: {
        posts,
        userGoals: 'Find React news',
        userContext: 'Prefer breaking launches',
        openRouterModel: 'meta-llama/llama-3.3-70b-instruct:free',
        openRouterApiKey: 'test-key',
      },
    });

    expect(res.status).toBe(200);
    expect(res.body.scores.p1).toBe(5);
    expect(res.body.scores.p2).toBeNull();
    expect(res.body.metrics).toMatchObject({ batchCount: 1, processedCount: 2 });
    expect(res.headers['x-rdd-metrics']).toBeDefined();
  });
});
