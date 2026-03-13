const nock = require('nock');

const { createMockRequest, createMockResponse } = require('../../helpers/run-handler');
const { makeSignedCookie } = require('../../../lib/cookies');
const { clearExpiringValue } = require('../../../lib/rate-limit-store');

const mockStore = new Map();

jest.mock('../../../lib/storage', () => ({
  get: jest.fn(async (key) => mockStore.get(key) ?? null),
  set: jest.fn(async (key, value) => {
    mockStore.set(key, value);
  }),
  delete: jest.fn(async (key) => {
    mockStore.delete(key);
  }),
}));

const snapshotHandler = require('../../../lib/api-handlers/reddit/snapshot');

function authCookie() {
  const cookie = makeSignedCookie('access', 'token123');
  return cookie.split(';')[0];
}

function buildPost(subreddit, id, createdUtc = Math.floor(Date.now() / 1000)) {
  return {
    data: {
      id,
      subreddit,
      title: `${subreddit} ${id}`,
      selftext: `Body for ${id}`,
      score: 42,
      num_comments: 7,
      created_utc: createdUtc,
      permalink: `/r/${subreddit}/comments/${id}`,
      url: `https://example.com/${id}`,
      domain: 'example.com',
      author: 'tester',
      thumbnail: 'https://example.com/thumb.jpg',
      link_flair_text: 'Test',
    },
  };
}

describe('/api/reddit/snapshot', () => {
  beforeAll(() => {
    process.env.SESSION_COOKIE_SECRET = process.env.SESSION_COOKIE_SECRET || 'test_secret_32_bytes_long_hex_string_123456';
    nock.disableNetConnect();
    nock.enableNetConnect('127.0.0.1');
  });

  afterAll(() => {
    nock.enableNetConnect();
  });

  afterEach(async () => {
    mockStore.clear();
    nock.cleanAll();
    await clearExpiringValue('reddit:upstream-cooldown');
  });

  test('handles non-enumerable request headers without 500', async () => {
    const oauth = nock('https://oauth.reddit.com');
    oauth
      .get('/r/programming/about.json')
      .reply(200, { data: { subscribers: 100, title: 'programming', icon_img: null, public_description: '' } })
      .get(new RegExp('^/r/programming/new\\.json'))
      .query(true)
      .times(2)
      .reply(200, {
        data: {
          children: [buildPost('programming', 'programming-1')],
          after: null,
        },
      });

    const req = createMockRequest({
      method: 'GET',
      url: '/api/reddit/snapshot?subs=programming&mode=new&limit=25&max_pages=1',
      headers: {
        cookie: authCookie(),
        origin: 'http://localhost:3000',
      },
    });

    const originalHeaders = req.headers;
    delete req.headers;
    Object.defineProperty(req, 'headers', {
      value: originalHeaders,
      enumerable: false,
      configurable: true,
      writable: true,
    });

    const { res } = createMockResponse();
    await snapshotHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body?.results)).toBe(true);
    expect(res.body.results[0].subreddit).toBe('programming');
    expect(res.body.snapshot?.cached).toBe(false);
  });

  test('supports unauthenticated public snapshot fetches', async () => {
    const sub = 'publicsnapshotalpha';
    const reddit = nock('https://www.reddit.com');
    reddit
      .get(`/r/${sub}/about.json`)
      .reply(200, { data: { subscribers: 100, title: sub, icon_img: null, public_description: '' } })
      .get(new RegExp(`^/r/${sub}/new\\.json`))
      .query(true)
      .reply(200, {
        data: {
          children: [buildPost(sub, `${sub}-1`)],
          after: null,
        },
      });

    const req = createMockRequest({
      method: 'GET',
      url: `/api/reddit/snapshot?subs=${sub}&mode=new&limit=25&max_pages=1`,
      headers: {
        origin: 'http://localhost:3000',
      },
    });

    const { res } = createMockResponse();
    await snapshotHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.auth_mode).toBe('public');
    expect(res.body.results[0].posts).toHaveLength(1);
    expect(res.body.snapshot?.cached).toBe(false);
    expect(reddit.isDone()).toBe(true);
  });

  test('materializes mode=new snapshots through persisted coverage state', async () => {
    const sub = 'covsnapalpha';
    const now = Math.floor(Date.now() / 1000);
    const reddit = nock('https://www.reddit.com');
    reddit
      .get(`/r/${sub}/about.json`)
      .reply(200, { data: { subscribers: 100, title: sub, icon_img: null, public_description: '' } })
      .get(new RegExp(`^/r/${sub}/new\\.json`))
      .query(true)
      .reply(200, {
        data: {
          children: [
            buildPost(sub, `${sub}-1`),
            buildPost(sub, `${sub}-old`, now - (2 * 86400)),
          ],
          after: 'page-2',
        },
      });

    const req = createMockRequest({
      method: 'GET',
      url: `/api/reddit/snapshot?subs=${sub}&mode=new&days=1&limit=25&max_pages=1`,
      headers: {
        origin: 'http://localhost:3000',
      },
    });

    const { res } = createMockResponse();
    await snapshotHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.auth_mode).toBe('public');
    expect(res.body.results[0].posts).toHaveLength(1);
    expect(res.body.results[0].coverage_state).toMatchObject({
      subreddit: sub,
      status: 'complete',
      complete_1d: true,
    });
    expect(Array.from(mockStore.keys()).some((key) => key.startsWith('reddit-coverage:'))).toBe(true);
    expect(reddit.isDone()).toBe(true);
  });

  test('keys snapshot cache by target_window_days', async () => {
    const sub = 'targetwindowalpha';
    const reddit = nock('https://www.reddit.com');
    reddit
      .get(`/r/${sub}/about.json`)
      .reply(200, { data: { subscribers: 100, title: sub, icon_img: null, public_description: '' } })
      .get(new RegExp(`^/r/${sub}/new\\.json`))
      .query(true)
      .reply(200, {
        data: {
          children: [buildPost(sub, `${sub}-window-1`)],
          after: null,
        },
      })
      .get(new RegExp(`^/r/${sub}/new\\.json`))
      .query(true)
      .reply(200, {
        data: {
          children: [buildPost(sub, `${sub}-window-3`)],
          after: null,
        },
      });

    const firstReq = createMockRequest({
      method: 'GET',
      url: `/api/reddit/snapshot?subs=${sub}&mode=new&days=5&target_window_days=1&limit=25&max_pages=1`,
      headers: {
        origin: 'http://localhost:3000',
      },
    });
    const firstRes = createMockResponse();
    await snapshotHandler(firstReq, firstRes.res);

    const secondReq = createMockRequest({
      method: 'GET',
      url: `/api/reddit/snapshot?subs=${sub}&mode=new&days=5&target_window_days=3&limit=25&max_pages=1`,
      headers: {
        origin: 'http://localhost:3000',
      },
    });
    const secondRes = createMockResponse();
    await snapshotHandler(secondReq, secondRes.res);

    expect(firstRes.res.statusCode).toBe(200);
    expect(secondRes.res.statusCode).toBe(200);
    expect(firstRes.res.body.results[0].posts[0].id).toBe(`${sub}-window-1`);
    expect(secondRes.res.body.results[0].posts[0].id).toBe(`${sub}-window-3`);
    expect(reddit.isDone()).toBe(true);
  });

  test('does not cache rate-limited payloads', async () => {
    const sub = 'uncacheablealpha';
    const firstPass = nock('https://oauth.reddit.com');
    firstPass
      .get(`/r/${sub}/about.json`)
      .reply(429, 'Too Many Requests', { 'Retry-After': '12' });

    const firstReq = createMockRequest({
      method: 'GET',
      url: `/api/reddit/snapshot?subs=${sub}&mode=top&limit=25&max_pages=1`,
      headers: {
        cookie: authCookie(),
        origin: 'http://localhost:3000',
      },
    });
    const firstRes = createMockResponse();
    await snapshotHandler(firstReq, firstRes.res);

    expect(firstRes.res.statusCode).toBe(200);
    expect(firstRes.res.body.rate_limited).toBe(true);
    expect(firstRes.res.body.snapshot).toMatchObject({
      cached: false,
      cacheable: false,
    });
    expect(firstPass.isDone()).toBe(true);
    await clearExpiringValue('reddit:upstream-cooldown');

    const secondPass = nock('https://oauth.reddit.com');
    secondPass
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

    const secondReq = createMockRequest({
      method: 'GET',
      url: `/api/reddit/snapshot?subs=${sub}&mode=top&limit=25&max_pages=1&fresh=1`,
      headers: {
        cookie: authCookie(),
        origin: 'http://localhost:3000',
      },
    });
    const secondRes = createMockResponse();
    await snapshotHandler(secondReq, secondRes.res);

    expect(secondRes.res.statusCode).toBe(200);
    expect(secondRes.res.body.rate_limited).toBe(false);
    expect(secondRes.res.body.results[0].posts).toHaveLength(1);
    expect(secondRes.res.body.snapshot).toMatchObject({
      cached: false,
      cacheable: true,
    });
    expect(secondPass.isDone()).toBe(true);
  });
});
