const nock = require('nock');

const { runHandler } = require('../helpers/run-handler');
const redditHandler = require('../../lib/api-handlers/reddit');
const aiRankHandler = require('../../lib/api-handlers/reddit/ai-rank');
const { makeSignedCookie } = require('../../lib/cookies');

function expectRedditResponseSchema(body) {
  expect(body).toMatchObject({
    mode: expect.any(String),
    time: expect.any(String),
    days: expect.any(Number),
    limit: expect.any(Number),
    max_pages: expect.any(Number),
    results: expect.any(Array),
    fetched_at: expect.any(Number),
    rate_limited: expect.any(Boolean),
    metrics: expect.objectContaining({
      subredditCount: expect.any(Number),
      totalPosts: expect.any(Number),
      rateLimitedCount: expect.any(Number),
      durationMs: expect.any(Number),
      redditRequestCount: expect.any(Number),
      sharedCooldownHit: expect.any(Boolean),
      requestCapped: expect.any(Boolean),
    }),
  });

  body.results.forEach((result) => {
    expect(result).toMatchObject({
      subreddit: expect.any(String),
      posts: expect.any(Array),
      partial: expect.any(Boolean),
    });
    result.posts.forEach((post) => {
      expect(post).toMatchObject({
        id: expect.any(String),
        subreddit: expect.any(String),
        title: expect.any(String),
        reddit_url: expect.any(String),
        external_url: expect.any(String),
        score: expect.any(Number),
        num_comments: expect.any(Number),
        created_utc: expect.any(Number),
      });
    });
  });
}

function expectAiRankResponseSchema(body) {
  expect(body).toMatchObject({
    scores: expect.any(Object),
    model: expect.any(String),
    metrics: expect.objectContaining({ batchCount: expect.any(Number), processedCount: expect.any(Number) }),
  });
  if (body.metadata) {
    Object.values(body.metadata).forEach((meta) => {
      expect(meta).toMatchObject({ confidence: expect.any(String), reason: expect.any(String) });
    });
  }
  if (body.failedPostIds) {
    expect(Array.isArray(body.failedPostIds)).toBe(true);
  }
}

beforeAll(() => {
  process.env.SESSION_COOKIE_SECRET = process.env.SESSION_COOKIE_SECRET || 'test_secret_32_bytes_long_hex_string_123456';
  nock.disableNetConnect();
  nock.enableNetConnect('127.0.0.1');
});

afterAll(() => {
  nock.enableNetConnect();
});

afterEach(() => {
  nock.cleanAll();
});

describe('API schema contracts', () => {
  test('GET /api/reddit response schema stays stable', async () => {
    const oauth = nock('https://oauth.reddit.com');
    oauth
      .get('/r/programming/about.json')
      .reply(200, { data: { subscribers: 100, title: 'programming' } })
      .get(new RegExp('^/r/programming/top\\.json'))
      .query(true)
      .reply(200, {
        data: {
          children: [
            {
              data: {
                id: 'abc',
                subreddit: 'programming',
                title: 'Test post',
                selftext: 'Body',
                score: 10,
                num_comments: 1,
                created_utc: Math.floor(Date.now() / 1000),
                permalink: '/r/programming/comments/abc',
                url: 'https://example.com/a',
                domain: 'example.com',
                author: 'user',
                thumbnail: null,
                link_flair_text: 'News',
              },
            },
          ],
          after: null,
        },
      });

    const res = await runHandler(redditHandler, {
      method: 'GET',
      url: '/api/reddit?subs=programming&mode=top',
      headers: { cookie: makeSignedCookie('access', 'token').split(';')[0] }
    });

    expect(res.status).toBe(200);
    expectRedditResponseSchema(res.body);
  });

  test('POST /api/reddit/ai-rank response schema stays stable', async () => {
    nock('https://openrouter.ai')
      .post('/api/v1/chat/completions')
      .reply(200, {
        choices: [{
          message: {
            content: JSON.stringify([
              { postId: 'p1', score: 5, confidence: 'high', reason: 'Matches goal' },
              { postId: 'p2', score: 3, confidence: 'medium', reason: 'Somewhat relevant' },
            ]),
          },
        }],
      });

    const res = await runHandler(aiRankHandler, {
      method: 'POST',
      url: '/api/reddit/ai-rank',
      headers: { origin: 'http://localhost:3000' },
      body: {
        posts: [
          { id: 'p1', title: 'A', subreddit: 'x', selftext: '', score: 1, num_comments: 0, created_utc: Math.floor(Date.now() / 1000) },
          { id: 'p2', title: 'B', subreddit: 'y', selftext: '', score: 1, num_comments: 0, created_utc: Math.floor(Date.now() / 1000) },
        ],
        userGoals: 'Find A and B',
        openRouterModel: 'meta-llama/llama-3.3-70b-instruct:free',
        openRouterApiKey: 'test-key',
      },
    });

    expect(res.status).toBe(200);
    expectAiRankResponseSchema(res.body);
  });
});
