const nock = require('nock');

const snapshotHandler = require('../../../lib/api-handlers/reddit/snapshot');
const { createMockRequest, createMockResponse } = require('../../helpers/run-handler');
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

describe('/api/reddit/snapshot', () => {
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
});
