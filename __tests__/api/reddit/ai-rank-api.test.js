const nock = require('nock');

const { runHandler } = require('../../helpers/run-handler');
const { makeSignedCookie } = require('../../../lib/cookies');
const aiRankHandler = require('../../../lib/api-handlers/reddit/ai-rank');

describe('/api/reddit/ai-rank', () => {
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
    delete process.env.OPENROUTER_API_KEY;
  });

  const basePayload = {
    posts: [
      { id: 'p1', title: 'React news', subreddit: 'reactjs', selftext: 'Hooks', score: 10, num_comments: 2, created_utc: Math.floor(Date.now() / 1000) },
      { id: 'p2', title: 'Rust release', subreddit: 'programming', selftext: '', score: 7, num_comments: 1, created_utc: Math.floor(Date.now() / 1000) }
    ],
    userGoals: 'Find frontend topics',
    userContext: 'Prefer practical tutorials, avoid memes',
    openRouterModel: 'meta-llama/llama-3.3-70b-instruct:free'
  };

  test('requires API key from body, cookie, or env', async () => {
    // Clear env var to simulate no API key configured
    const originalEnvKey = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    
    // Need to reload the module to pick up the new env var
    jest.resetModules();
    const freshHandler = require('../../../lib/api-handlers/reddit/ai-rank');
    
    const res = await runHandler(freshHandler, {
      method: 'POST',
      url: '/api/reddit/ai-rank',
      body: basePayload,
      headers: { origin: 'http://localhost:3000' }
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('OpenRouter API key required');
    
    // Restore env var
    if (originalEnvKey) {
      process.env.OPENROUTER_API_KEY = originalEnvKey;
    }
  });

  test('sends payload to OpenRouter and maps scores', async () => {
    let capturedBody;
    nock('https://openrouter.ai')
      .post('/api/v1/chat/completions', (body) => {
        capturedBody = body;
        return true;
      })
      .reply(200, {
        choices: [{
          message: {
            content: JSON.stringify([
              { postId: 'p1', score: 5, confidence: 'high', reason: 'React' }
            ])
          }
        }]
      });

    const res = await runHandler(aiRankHandler, {
      method: 'POST',
      url: '/api/reddit/ai-rank',
      body: { ...basePayload, openRouterApiKey: 'test-key' },
      headers: { origin: 'http://localhost:3000' }
    });

    expect(res.status).toBe(200);
    const parsedBody = typeof capturedBody === 'string' ? JSON.parse(capturedBody) : capturedBody;
    expect(parsedBody.messages[0].content).toContain('Prefer practical tutorials');
    expect(parsedBody.messages[1].content).toContain('React news');
    expect(parsedBody.model).toBe('stepfun/step-3.5-flash:free');
    expect(parsedBody.models).toBeUndefined();
    expect(parsedBody.response_format).toBeUndefined();
    expect(parsedBody.provider).toBeUndefined();
    expect(res.body.scores.p1).toBe(5);
    expect(res.body.scores.p2).not.toBeNull();
    expect(res.body.metadata.p1).toMatchObject({ confidence: 'high' });
    expect(res.body.opportunities.p1).toBeDefined();
    expect(res.body.opportunities.p2).toBeDefined();
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items.find((item) => item.postId === 'p1')).toMatchObject({
      review: { status: 'llm_reviewed', failed: false },
    });
    expect(res.body.items.find((item) => item.postId === 'p2')).toMatchObject({
      opportunity: expect.objectContaining({
        classification: expect.any(Object),
        action: expect.any(Object),
      }),
      review: { status: 'failed', failed: true },
    });
    expect(res.headers['x-rdd-metrics']).toBeDefined();
  });

  test('uses cookie-stored API key when provided', async () => {
    const cookie = makeSignedCookie('openrouter_key', 'sk-or-secret-key-1234567890');

    nock('https://openrouter.ai')
      .post('/api/v1/chat/completions')
      .reply(200, {
        choices: [{ message: { content: JSON.stringify([{ postId: 'p1', score: 4 }]) } }]
      });

    const res = await runHandler(aiRankHandler, {
      method: 'POST',
      url: '/api/reddit/ai-rank',
      body: basePayload,
      headers: { cookie, origin: 'http://localhost:3000' }
    });

    expect(res.status).toBe(200);
    expect(res.body.scores.p1).toBe(4);
  });

  test('marks failedPostIds when OpenRouter errors', async () => {
    nock('https://openrouter.ai')
      .post('/api/v1/chat/completions')
      .reply(500, { error: 'rate limit' });

    const res = await runHandler(aiRankHandler, {
      method: 'POST',
      url: '/api/reddit/ai-rank',
      body: { ...basePayload, openRouterApiKey: 'test-key' },
      headers: { origin: 'http://localhost:3000' }
    });

    expect(res.status).toBe(200);
    expect(res.body.failedPostIds).toEqual(expect.arrayContaining(['p1', 'p2']));
    expect(res.body.items.every((item) => item.review?.status === 'failed')).toBe(true);
    expect(res.body.items.every((item) => item.opportunity)).toBe(true);
    expect(Object.values(res.body.scores).every((score) => score !== undefined && score !== null)).toBe(true);
  });

  test('accepts larger single-request post payloads for server-side batching', async () => {
    const posts = Array.from({ length: 120 }, (_, index) => ({
      id: `p${index + 1}`,
      title: `Post ${index + 1}`,
      subreddit: 'programming',
      selftext: '',
      score: index + 1,
      num_comments: index % 10,
      created_utc: Math.floor(Date.now() / 1000),
    }));

    nock('https://openrouter.ai')
      .post('/api/v1/chat/completions')
      .times(4)
      .reply(200, {
        choices: [{ message: { content: JSON.stringify([]) } }]
      });

    const res = await runHandler(aiRankHandler, {
      method: 'POST',
      url: '/api/reddit/ai-rank',
      body: { ...basePayload, posts, openRouterApiKey: 'test-key' },
      headers: { origin: 'http://localhost:3000' }
    });

    expect(res.status).toBe(200);
    expect(Object.keys(res.body.scores)).toHaveLength(120);
  });

  test('retries free-model ranking on upstream 429 and succeeds with the next fallback', async () => {
    const bodies = [];
    nock('https://openrouter.ai')
      .post('/api/v1/chat/completions', (body) => {
        bodies.push(typeof body === 'string' ? JSON.parse(body) : body);
        return true;
      })
      .reply(429, { error: { message: 'rate limited' } })
      .post('/api/v1/chat/completions', (body) => {
        bodies.push(typeof body === 'string' ? JSON.parse(body) : body);
        return true;
      })
      .reply(200, {
        model: 'qwen/qwen3-next-80b-a3b-instruct:free',
        choices: [{
          message: {
            content: JSON.stringify([
              { postId: 'p1', score: 5, confidence: 'high', reason: 'React' },
              { postId: 'p2', score: 1, confidence: 'low', reason: 'Weak fit' }
            ])
          }
        }]
      });

    const res = await runHandler(aiRankHandler, {
      method: 'POST',
      url: '/api/reddit/ai-rank',
      body: { ...basePayload, openRouterApiKey: 'test-key' },
      headers: { origin: 'http://localhost:3000' }
    });

    expect(res.status).toBe(200);
    expect(bodies).toHaveLength(2);
    expect(bodies[0].model).toBe('stepfun/step-3.5-flash:free');
    expect(bodies[1].model).toBe('meta-llama/llama-3.3-70b-instruct:free');
    expect(res.body.modelsUsed).toEqual(['qwen/qwen3-next-80b-a3b-instruct:free']);
    expect(res.body.fallbackUsed).toBe(true);
    expect(res.body.scores).toMatchObject({ p1: 5, p2: 1 });
  });

  test('relaxes routing parameters on 404 before switching away from the requested model', async () => {
    const bodies = [];
    nock('https://openrouter.ai')
      .post('/api/v1/chat/completions', (body) => {
        bodies.push(typeof body === 'string' ? JSON.parse(body) : body);
        return true;
      })
      .reply(404, { error: { message: 'No endpoints found that can handle the requested parameters.' } })
      .post('/api/v1/chat/completions', (body) => {
        bodies.push(typeof body === 'string' ? JSON.parse(body) : body);
        return true;
      })
      .reply(200, {
        model: 'meta-llama/llama-3.3-70b-instruct:free',
        choices: [{
          message: {
            content: JSON.stringify([
              { postId: 'p1', score: 4, confidence: 'high', reason: 'React' },
              { postId: 'p2', score: 2, confidence: 'medium', reason: 'Some fit' }
            ])
          }
        }]
      });

    const res = await runHandler(aiRankHandler, {
      method: 'POST',
      url: '/api/reddit/ai-rank',
      body: { ...basePayload, openRouterApiKey: 'test-key' },
      headers: { origin: 'http://localhost:3000' }
    });

    expect(res.status).toBe(200);
    expect(bodies).toHaveLength(2);
    expect(bodies[0].model).toBe('stepfun/step-3.5-flash:free');
    expect(bodies[0].provider).toBeUndefined();
    expect(bodies[0].plugins).toBeUndefined();
    expect(bodies[1].model).toBe('stepfun/step-3.5-flash:free');
    expect(bodies[1].provider).toMatchObject({ sort: 'throughput' });
    expect(bodies[1].provider.require_parameters).toBeUndefined();
    expect(bodies[1].plugins).toBeUndefined();
    expect(res.body.model).toBe('meta-llama/llama-3.3-70b-instruct:free');
    expect(res.body.fallbackUsed).toBe(true);
    expect(res.body.scores).toMatchObject({ p1: 4, p2: 2 });
  });
});
