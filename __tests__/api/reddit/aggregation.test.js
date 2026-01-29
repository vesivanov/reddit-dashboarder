const request = require('supertest');
const nock = require('nock');

const createApp = require('../../../app');
const { makeSignedCookie } = require('../../../lib/cookies');

function authCookie() {
  const cookie = makeSignedCookie('access', 'token123');
  return cookie.split(';')[0];
}

function buildPost(subreddit, id) {
  return {
    data: {
      id,
      subreddit,
      title: `${subreddit} ${id}`,
      selftext: `Body for ${id}`,
      score: 42,
      num_comments: 7,
      created_utc: Math.floor(Date.now() / 1000),
      permalink: `/r/${subreddit}/comments/${id}`,
      url: `https://example.com/${id}`,
      domain: 'example.com',
      author: 'tester',
      thumbnail: 'https://example.com/thumb.jpg',
      link_flair_text: 'Test',
    },
  };
}

// Mock server for supertest - always use mock to avoid port binding issues
function createMockServer() {
  const server = {
    address: () => ({ port: 0, family: 'IPv4', address: '127.0.0.1' }),
    close: (callback) => { 
      if (callback) setTimeout(callback, 0); 
    },
    listen: () => {
      // Prevent any error events from being emitted
      return server;
    },
    on: (event, handler) => {
      // Silently handle all events to prevent unhandled errors
      return server;
    },
    once: (event, handler) => {
      return server;
    },
    removeListener: () => server,
    removeAllListeners: () => server,
    setMaxListeners: () => server,
  };
  // Pre-attach error handler to prevent unhandled errors
  return server;
}

function setupAppWithMockListen() {
  const app = createApp();
  // Always return mock server - supertest doesn't need a real listening server
  // It calls the Express app directly, so the server is just for address() info
  app.listen = function(...args) {
    return createMockServer();
  };
  return app;
}

describe('/api/reddit aggregation', () => {
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
  });

  afterEach(() => {
    nock.cleanAll();
  });

  test('merges multiple subreddits and sets cache + metrics headers', async () => {
    const oauth = nock('https://oauth.reddit.com');

    ['programming', 'javascript'].forEach((sub) => {
      oauth
        .get(`/r/${sub}/about.json`)
        .reply(200, { data: { subscribers: 100, title: sub, icon_img: null, public_description: '' } })
        .get(new RegExp(`^/r/${sub}/top\\.json`))
        .query(true)
        .reply(200, {
          data: {
            children: [buildPost(sub, `${sub}-1`)],
            after: null,
          },
        });
    });

    const res = await request(app)
      .get('/api/reddit?subs=programming,javascript&mode=top&limit=50')
      .set('Cookie', authCookie())
      .set('Origin', 'http://localhost:3000');

    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(2);
    expect(res.body.metrics).toMatchObject({ subredditCount: 2, totalPosts: 2 });
    expect(res.headers['cache-control']).toBe('public, max-age=0, s-maxage=600');
    expect(() => JSON.parse(res.headers['x-rdd-metrics'])).not.toThrow();
  });

  test('flags rate-limited subreddit while returning other results', async () => {
    const oauth = nock('https://oauth.reddit.com');

    oauth
      .get('/r/programming/about.json')
      .reply(200, { data: { subscribers: 100, title: 'programming' } })
      .get(new RegExp('^/r/programming/top\\.json'))
      .query(true)
      .reply(200, {
        data: {
          children: [buildPost('programming', 'prog-1')],
          after: null,
        },
      });

    oauth
      .get('/r/javascript/about.json')
      .reply(200, { data: { subscribers: 100, title: 'javascript' } })
      .get(new RegExp('^/r/javascript/top\\.json'))
      .query(true)
      .reply(429, 'Too Many Requests');

    const res = await request(app)
      .get('/api/reddit?subs=programming,javascript&mode=top')
      .set('Cookie', authCookie())
      .set('Origin', 'http://localhost:3000');

    expect(res.status).toBe(200);
    const programming = res.body.results.find((r) => r.subreddit === 'programming');
    const javascript = res.body.results.find((r) => r.subreddit === 'javascript');
    expect(programming.posts).toHaveLength(1);
    expect(javascript.error).toContain('RATE_LIMIT');
    expect(res.body.rate_limited).toBe(true);
    expect(res.headers['x-rate-limited']).toBe('1');
  });

  test('rejects invalid subreddit names', async () => {
    const res = await request(app)
      .get('/api/reddit?subs=valid,bad*name')
      .set('Cookie', authCookie());

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid subreddit name');
  });

  test('clamps limit and max_pages parameters', async () => {
    const oauth = nock('https://oauth.reddit.com');
    oauth
      .get('/r/programming/about.json')
      .reply(200, { data: { subscribers: 100, title: 'programming' } })
      .get(new RegExp('^/r/programming/top\\.json'))
      .query(true)
      .reply(200, {
        data: {
          children: [buildPost('programming', 'p1')],
          after: null,
        },
      });

    const res = await request(app)
      .get('/api/reddit?subs=programming&mode=top&limit=5&max_pages=99')
      .set('Cookie', authCookie());

    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(25);
    expect(res.body.max_pages).toBe(10);
  });
});
