const request = require('supertest');
const nock = require('nock');

const createApp = require('../../../app');
const { makeSignedCookie } = require('../../../lib/cookies');

// Mock server for supertest - always use mock to avoid port binding issues
function createMockServer() {
  const server = {
    address: () => ({ port: 0, family: 'IPv4', address: '127.0.0.1' }),
    close: (callback) => { 
      if (callback) setTimeout(callback, 0); 
    },
    listen: () => server,
    on: () => server,
    once: () => server,
    removeListener: () => server,
  };
  return server;
}

function setupAppWithMockListen() {
  const app = createApp();
  // Always return mock server - supertest doesn't need a real listening server
  app.listen = function(...args) {
    return createMockServer();
  };
  return app;
}

describe('/api/reddit/ai-rank', () => {
  let app;

  beforeAll(() => {
    process.env.SESSION_COOKIE_SECRET = process.env.SESSION_COOKIE_SECRET || 'test_secret_32_bytes_long_hex_string_123456';
    nock.disableNetConnect();
    nock.enableNetConnect('127.0.0.1');
  });

  afterAll(() => {
    nock.enableNetConnect();
  });

  beforeEach(() => {
    app = setupAppWithMockListen();
    delete process.env.OPENROUTER_API_KEY;
  });

  afterEach(() => {
    nock.cleanAll();
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
    const res = await request(app)
      .post('/api/reddit/ai-rank')
      .send(basePayload);

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

    const res = await request(app)
      .post('/api/reddit/ai-rank')
      .send({ ...basePayload, openRouterApiKey: 'test-key' });

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

    const res = await request(app)
      .post('/api/reddit/ai-rank')
      .set('Cookie', cookie)
      .send(basePayload);

    expect(res.status).toBe(200);
    expect(res.body.scores.p1).toBe(4);
  });

  test('marks failedPostIds when OpenRouter errors', async () => {
    nock('https://openrouter.ai')
      .post('/api/v1/chat/completions')
      .reply(500, { error: 'rate limit' });

    const res = await request(app)
      .post('/api/reddit/ai-rank')
      .send({ ...basePayload, openRouterApiKey: 'test-key' });

    expect(res.status).toBe(200);
    expect(res.body.failedPostIds).toEqual(expect.arrayContaining(['p1', 'p2']));
    expect(Object.values(res.body.scores).every((score) => score === null)).toBe(true);
  });
});
