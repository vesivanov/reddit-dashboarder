const nock = require('nock');

const { runHandler } = require('../../helpers/run-handler');
const redditHandler = require('../../../lib/api-handlers/reddit');
const { makeSignedCookie } = require('../../../lib/cookies');

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

describe('/api/reddit aggregation', () => {
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

    const res = await runHandler(redditHandler, {
      method: 'GET',
      url: '/api/reddit?subs=programming,javascript&mode=top&limit=50',
      headers: {
        cookie: authCookie(),
        origin: 'http://localhost:3000',
      },
    });

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
      .reply(429, 'Too Many Requests');

    const res = await runHandler(redditHandler, {
      method: 'GET',
      url: '/api/reddit?subs=programming,javascript&mode=top',
      headers: {
        cookie: authCookie(),
        origin: 'http://localhost:3000',
      },
    });

    expect(res.status).toBe(200);
    const programming = res.body.results.find((r) => r.subreddit === 'programming');
    const javascript = res.body.results.find((r) => r.subreddit === 'javascript');
    expect(programming.posts).toHaveLength(1);
    expect(javascript.posts).toHaveLength(0);
    expect(res.body.results).toHaveLength(2);
  });

  test('rejects invalid subreddit names', async () => {
    const res = await runHandler(redditHandler, {
      method: 'GET',
      url: '/api/reddit?subs=valid,bad*name',
      headers: { cookie: authCookie() },
    });

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

    const res = await runHandler(redditHandler, {
      method: 'GET',
      url: '/api/reddit?subs=programming&mode=top&limit=5&max_pages=99',
      headers: { cookie: authCookie() },
    });

    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(25);
    expect(res.body.max_pages).toBe(30);
  });

  test('fetches all available pages inside the selected timeframe when max_pages=all', async () => {
    const now = Math.floor(Date.now() / 1000);
    const withinWindow = now - 3600;
    const tooOld = now - (2 * 86400);

    const oauth = nock('https://oauth.reddit.com');
    oauth
      .get('/r/programming/about.json')
      .reply(200, { data: { subscribers: 100, title: 'programming' } })
      .get('/r/programming/new.json')
      .query((query) => query.limit === '1')
      .reply(200, {
        data: {
          children: [buildPost('programming', 'probe', withinWindow)],
          after: 'page-1',
        },
      })
      .get('/r/programming/new.json')
      .query((query) => query.limit === '100' && !query.after)
      .reply(200, {
        data: {
          children: [buildPost('programming', 'p1', withinWindow)],
          after: 'page-2',
        },
      })
      .get('/r/programming/new.json')
      .query((query) => query.limit === '100' && query.after === 'page-2')
      .reply(200, {
        data: {
          children: [
            buildPost('programming', 'p2', withinWindow),
            buildPost('programming', 'old-post', tooOld),
          ],
          after: 'page-3',
        },
      });

    const res = await runHandler(redditHandler, {
      method: 'GET',
      url: '/api/reddit?subs=programming&mode=new&days=1&limit=100&max_pages=all',
      headers: { cookie: authCookie() },
    });

    expect(res.status).toBe(200);
    expect(res.body.max_pages).toBe(0);
    expect(res.body.fetch_all_pages).toBe(true);
    expect(res.body.results[0].posts.map((post) => post.id)).toEqual(['p1', 'p2']);
    expect(res.body.results[0].partial).toBe(false);
  });

  test('flags timed_out when execution budget is exhausted', async () => {
    const originalRuntime = process.env.API_MAX_RUNTIME_MS;
    const originalBuffer = process.env.API_TIMEOUT_BUFFER_MS;
    process.env.API_MAX_RUNTIME_MS = '1100';
    process.env.API_TIMEOUT_BUFFER_MS = '0';

    const oauth = nock('https://oauth.reddit.com');
    oauth
      .get('/r/slow/about.json')
      .reply(200, { data: { subscribers: 5, title: 'slow' } });

    try {
      const res = await runHandler(redditHandler, {
        method: 'GET',
        url: '/api/reddit?subs=slow&mode=top',
        headers: { cookie: authCookie() },
      });

      expect(res.status).toBe(200);
      expect(res.body.timed_out).toBe(true);
      expect(res.body.results[0].timed_out).toBe(true);
      expect(res.headers['x-rdd-timed-out']).toBe('1');
    } finally {
      process.env.API_MAX_RUNTIME_MS = originalRuntime;
      process.env.API_TIMEOUT_BUFFER_MS = originalBuffer;
    }
  });
});
