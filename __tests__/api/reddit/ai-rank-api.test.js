const nock = require('nock');

const { runHandler } = require('../../helpers/run-handler');
const { makeSignedCookie } = require('../../../lib/cookies');
const aiRankHandler = require('../../../api/reddit/ai-rank');

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
    const res = await runHandler(aiRankHandler, {
      method: 'POST',
      url: '/api/reddit/ai-rank',
      body: basePayload,
      headers: { origin: 'http://localhost:3000' }
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('OpenRouter API key required');
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
    expect(res.body.scores).toMatchObject({ p1: 5, p2: null });
    expect(res.body.metadata.p1).toMatchObject({ confidence: 'high' });
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
    expect(Object.values(res.body.scores).every((score) => score === null)).toBe(true);
  });
});
