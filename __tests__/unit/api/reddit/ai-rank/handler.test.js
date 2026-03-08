const { describe, test, expect, beforeEach, afterEach } = require('@jest/globals');

process.env.SESSION_COOKIE_SECRET = 'test_secret_32_bytes_long_hex_string_123456';

const handler = require('../../../../../lib/api-handlers/reddit/ai-rank');
const { makeSignedCookie } = require('../../../../../lib/cookies');

function createMockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn().mockReturnValue(res);
  res.end = jest.fn().mockReturnValue(res);
  return res;
}

describe('AI rank handler', () => {
  let res;

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    res = createMockRes();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.resetAllMocks();
    delete global.fetch;
  });

  test('rejects requests without posts array', async () => {
    const req = { method: 'POST', body: { userGoals: '', openRouterModel: 'model' }, headers: { cookie: '' } };
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'posts array is required' }));
  });

  test('uses API key from secure cookie when body key missing', async () => {
    const req = {
      method: 'POST',
      body: {
        posts: [{ id: 'post1', title: 'Test', subreddit: 'test', score: 1, num_comments: 1, created_utc: Date.now() / 1000 }],
        userGoals: 'Find good posts',
        openRouterModel: 'meta-llama/llama-3.3-70b-instruct:free',
      },
      headers: { cookie: '' },
    };

    const cookie = makeSignedCookie('openrouter_key', 'sk-or-valid-key');
    req.headers.cookie = cookie.split(';')[0];

    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify([{ postId: 'post1', score: 5, confidence: 'high', reason: 'Relevant' }]) } }],
      })
    });

    await handler(req, res);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const payload = res.json.mock.calls[0][0];
    expect(payload.scores.post1).toBe(5);
    expect(payload.processed).toBe(1);
  });

  test('includes failedPostIds for missing AI responses', async () => {
    const posts = [
      { id: 'p1', title: 'One', subreddit: 'test', score: 1, num_comments: 0, created_utc: Date.now() / 1000 },
      { id: 'p2', title: 'Two', subreddit: 'test', score: 2, num_comments: 0, created_utc: Date.now() / 1000 },
    ];
    const req = {
      method: 'POST',
      body: {
        posts,
        userGoals: 'Need two posts',
        openRouterModel: 'meta-llama/llama-3.3-70b-instruct:free',
        openRouterApiKey: 'inline-key',
      },
      headers: { cookie: '' },
    };

    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify([{ postId: 'p1', score: 5, confidence: 'high', reason: 'Great' }]) } }],
      })
    });

    await handler(req, res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.scores.p1).toBe(5);
    expect(payload.scores.p2).toBeNull();
    expect(payload.failedPostIds).toContain('p2');
  });

  test('returns structured opportunities alongside legacy scores', async () => {
    const req = {
      method: 'POST',
      body: {
        posts: [{ id: 'post1', title: 'Need help with SEO', subreddit: 'smallbusiness', score: 14, num_comments: 5, created_utc: Date.now() / 1000 }],
        userGoals: 'Find commercial marketing opportunities',
        openRouterModel: 'meta-llama/llama-3.3-70b-instruct:free',
        openRouterApiKey: 'inline-key',
      },
      headers: { cookie: '' },
    };

    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify([{
              postId: 'post1',
              score: 5,
              confidence: 'high',
              reason: 'Business owner needs SEO help now',
              opportunityType: 'lead',
              recommendedAction: 'reply_now',
              signals: {
                commercialIntent: 0.95,
                serviceFit: 0.9,
                buyerSignal: 0.8,
                urgency: 0.85,
                replyability: 0.8,
                researchValue: 0.1,
                authorityFit: 0.75,
                risk: 0.05,
              }
            }])
          }
        }],
      })
    });

    await handler(req, res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.scores.post1).toBe(5);
    expect(payload.opportunities.post1).toMatchObject({
      classification: { type: 'lead' },
      action: { recommended: 'reply_now' },
    });
    expect(payload.opportunities.post1.scores.priority).toBeGreaterThan(0.6);
  });
});
