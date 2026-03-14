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
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
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
    expect(payload.scores.p2).not.toBeNull();
    expect(payload.opportunities.p2).toBeDefined();
    expect(payload.failedPostIds).toContain('p2');
    expect(payload.items.find((item) => item.postId === 'p2')).toMatchObject({
      opportunity: expect.objectContaining({
        classification: expect.any(Object),
        action: expect.any(Object),
      }),
      review: { status: 'failed', failed: true },
    });
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
    expect(payload.items.find((item) => item.postId === 'post1')).toMatchObject({
      review: { status: 'llm_reviewed', failed: false },
    });
    expect(payload.opportunities.post1.scores.priority).toBeGreaterThan(0.6);
  });

  test('reports fallback model usage when OpenRouter routes a free request to another model', async () => {
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
        model: 'qwen/qwen3-next-80b-a3b-instruct:free',
        choices: [{
          message: {
            content: JSON.stringify([{
              postId: 'post1',
              score: 4,
              confidence: 'high',
              reason: 'Clear buyer signal',
              opportunityType: 'lead',
              recommendedAction: 'reply_now',
              signals: {
                commercialIntent: 0.9,
                serviceFit: 0.9,
                buyerSignal: 0.8,
                urgency: 0.75,
                replyability: 0.8,
                researchValue: 0.1,
                authorityFit: 0.7,
                risk: 0.1,
              }
            }])
          }
        }],
      })
    });

    await handler(req, res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.model).toBe('qwen/qwen3-next-80b-a3b-instruct:free');
    expect(payload.requestedModel).toBe('meta-llama/llama-3.3-70b-instruct:free');
    expect(payload.modelsUsed).toContain('qwen/qwen3-next-80b-a3b-instruct:free');
    expect(payload.fallbackUsed).toBe(true);
  });

  test('forces the fast free model for broad free-model coverage runs', async () => {
    const posts = Array.from({ length: 150 }, (_, index) => ({
      id: `post${index + 1}`,
      title: `Need help ${index + 1}`,
      subreddit: 'smallbusiness',
      score: 10,
      num_comments: 2,
      created_utc: Date.now() / 1000,
    }));
    const req = {
      method: 'POST',
      body: {
        posts,
        userGoals: 'Find commercial marketing opportunities',
        openRouterModel: 'qwen/qwen3-next-80b-a3b-instruct:free',
        openRouterApiKey: 'inline-key',
        llmPostLimit: 80,
      },
      headers: { cookie: '' },
    };

    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        model: 'stepfun/step-3.5-flash:free',
        choices: [{
          message: {
            content: JSON.stringify(posts.map((post) => ({
              postId: post.id,
              score: 3,
              confidence: 'medium',
              reason: 'Relevant',
              opportunityType: 'lead',
              recommendedAction: 'reply_now',
              signals: {
                commercialIntent: 0.6,
                serviceFit: 0.6,
                buyerSignal: 0.6,
                urgency: 0.4,
                replyability: 0.5,
                researchValue: 0.2,
                authorityFit: 0.5,
                risk: 0.2,
              },
            }))),
          },
        }],
      }),
    });

    await handler(req, res);

    const [fetchUrl, fetchOptions] = global.fetch.mock.calls[0];
    expect(fetchUrl).toContain('openrouter.ai');
    const requestBody = JSON.parse(fetchOptions.body);
    expect(requestBody.model).toBe('stepfun/step-3.5-flash:free');

    const payload = res.json.mock.calls[0][0];
    expect(payload.requestedModel).toBe('qwen/qwen3-next-80b-a3b-instruct:free');
    expect(payload.selectedModel).toBe('stepfun/step-3.5-flash:free');
  });

  test('writes structured AI ranking events to the console log', async () => {
    const req = {
      method: 'POST',
      body: {
        posts: [{ id: 'post1', title: 'Need help with SEO', subreddit: 'smallbusiness', score: 14, num_comments: 5, created_utc: Date.now() / 1000 }],
        userGoals: 'Find commercial marketing opportunities',
        userContext: 'We sell SEO services to small businesses.',
        openRouterModel: 'meta-llama/llama-3.3-70b-instruct:free',
        openRouterApiKey: 'inline-key',
        auditContext: {
          clientRunId: 'airun_test_1',
          chunkIndex: 0,
          totalChunks: 3,
          totalFeedPosts: 696,
        },
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

    const aiLogCalls = console.warn.mock.calls
      .concat(console.error.mock.calls)
      .filter((call) => call[0] === '[ai-ranking-event]')
      .map((call) => JSON.parse(call[1]));

    expect(aiLogCalls.map((entry) => entry.eventType)).toEqual(expect.arrayContaining([
      'request_started',
      'request_context',
      'batch_completed',
      'post_scores_part',
      'request_completed',
    ]));
    expect(aiLogCalls.find((entry) => entry.eventType === 'request_context')).toMatchObject({
      clientRunId: 'airun_test_1',
      chunkIndex: 0,
      totalChunks: 3,
      totalFeedPosts: 696,
      userGoals: 'Find commercial marketing opportunities',
      userContext: 'We sell SEO services to small businesses.',
      reviewPlan: expect.objectContaining({
        keywords: expect.any(Array),
        llmPlannedPostIds: ['post1'],
      }),
    });
    expect(aiLogCalls.find((entry) => entry.eventType === 'post_scores_part')).toMatchObject({
      clientRunId: 'airun_test_1',
      postCount: 1,
      posts: [expect.objectContaining({
        postId: 'post1',
        title: 'Need help with SEO',
        selftext: '',
        subreddit: 'smallbusiness',
        post: expect.objectContaining({
          id: 'post1',
          title: 'Need help with SEO',
          selftext: '',
          subreddit: 'smallbusiness',
          redditScore: 14,
          numComments: 5,
        }),
        plannedReview: 'llm',
        reviewStatus: 'llm_reviewed',
        opportunityType: 'lead',
        recommendedAction: 'reply_now',
      })],
    });
    expect(aiLogCalls.find((entry) => entry.eventType === 'request_completed')).toMatchObject({
      status: 'success',
      clientRunId: 'airun_test_1',
      postCount: 1,
      llmReviewedCount: 1,
      failedReviewCount: 0,
    });
  });
});
