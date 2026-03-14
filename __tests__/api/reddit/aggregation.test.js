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
    delete process.env.REDDIT_ALLOW_PUBLIC_FALLBACK;
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
    expect(res.body.metrics.redditRequestCount).toBeGreaterThan(0);
    expect(res.body.metrics.sharedCooldownHit).toBe(false);
    expect(res.headers['cache-control']).toBe('public, max-age=0, s-maxage=600');
    expect(() => JSON.parse(res.headers['x-rdd-metrics'])).not.toThrow();
  });

  test('falls back to public reddit read mode without authentication', async () => {
    const sub = 'publicfallbackalpha';
    const reddit = nock('https://www.reddit.com');
    reddit
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

    const res = await runHandler(redditHandler, {
      method: 'GET',
      url: `/api/reddit?subs=${sub}&mode=top&limit=25&max_pages=1`,
      headers: {
        origin: 'http://localhost:3000',
      },
    });

    expect(res.status).toBe(200);
    expect(res.body.auth_mode).toBe('public');
    expect(res.body.results[0].posts).toHaveLength(1);
    expect(reddit.isDone()).toBe(true);
  });

  test('returns 401 without authentication when public fallback is disabled', async () => {
    process.env.REDDIT_ALLOW_PUBLIC_FALLBACK = 'false';

    const res = await runHandler(redditHandler, {
      method: 'GET',
      url: '/api/reddit?subs=programming&mode=top&limit=25&max_pages=1',
      headers: {
        origin: 'http://localhost:3000',
      },
    });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Not authenticated' });
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
      .query((query) => query.limit === '25' && !query.after)
      .reply(200, {
        data: {
          children: [buildPost('programming', 'p1', withinWindow)],
          after: 'page-2',
        },
      })
      .get('/r/programming/new.json')
      .query((query) => query.limit === '25' && query.after === 'page-2')
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

  test('uses the oauth listing endpoint directly for mode=new without a probe request', async () => {
    const sub = 'directnewalpha';
    const oauth = nock('https://oauth.reddit.com');
    oauth
      .get(`/r/${sub}/about.json`)
      .reply(200, { data: { subscribers: 100, title: sub } })
      .get(`/r/${sub}/new.json`)
      .query((query) => query.limit === '25' && query.raw_json === '1' && !query.after)
      .reply(200, {
        data: {
          children: [buildPost(sub, 'direct-new-1')],
          after: null,
        },
      });

    const res = await runHandler(redditHandler, {
      method: 'GET',
      url: `/api/reddit?subs=${sub}&mode=new&days=1&limit=100&max_pages=1`,
      headers: {
        cookie: authCookie(),
        origin: 'http://localhost:3000',
      },
    });

    expect(res.status).toBe(200);
    expect(res.body.results[0].posts.map((post) => post.id)).toEqual(['direct-new-1']);
    expect(res.body.results[0].coverage_state).toMatchObject({
      subreddit: sub,
      status: 'complete',
      complete_1d: true,
    });
    expect(oauth.isDone()).toBe(true);
  });

  test('skips subreddit metadata fetches for large batches', async () => {
    const subs = Array.from({ length: 13 }, (_, index) => `batchsub${index + 1}`);
    const oauth = nock('https://oauth.reddit.com');

    subs.forEach((sub) => {
      oauth
        .get(`/r/${sub}/top.json`)
        .query((query) => query.limit === '25' && query.raw_json === '1' && query.t === 'day')
        .reply(200, {
          data: {
            children: [buildPost(sub, `${sub}-1`)],
            after: null,
          },
        });
    });

    const res = await runHandler(redditHandler, {
      method: 'GET',
      url: `/api/reddit?subs=${subs.join(',')}&mode=top&limit=100&max_pages=1`,
      headers: {
        cookie: authCookie(),
        origin: 'http://localhost:3000',
      },
    });

    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(13);
    expect(res.body.results.every((result) => result.posts.length === 1)).toBe(true);
    expect(res.body.results.every((result) => result.meta?.subscribers == null)).toBe(true);
    expect(oauth.isDone()).toBe(true);
  });

  test('server-enforces shallower fetch depth for very large subreddit batches', async () => {
    const subs = Array.from({ length: 20 }, (_, index) => `capsub${index + 1}`);
    const oauth = nock('https://oauth.reddit.com');

    subs.forEach((sub) => {
      oauth
        .get(`/r/${sub}/new.json`)
        .query((query) => query.limit === '25' && query.raw_json === '1' && !query.after)
        .reply(200, {
          data: {
            children: [buildPost(sub, `${sub}-1`)],
            after: 'page-2',
          },
        })
        .get(`/r/${sub}/new.json`)
        .query((query) => query.limit === '25' && query.raw_json === '1' && query.after === 'page-2')
        .reply(200, {
          data: {
            children: [buildPost(sub, `${sub}-2`)],
            after: 'page-3-that-should-not-be-fetched',
          },
        });
    });

    const res = await runHandler(redditHandler, {
      method: 'GET',
      url: `/api/reddit?subs=${subs.join(',')}&mode=new&limit=100&max_pages=all`,
      headers: {
        cookie: authCookie(),
        origin: 'http://localhost:3000',
      },
    });

    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(25);
    expect(res.body.max_pages).toBe(2);
    expect(res.body.fetch_all_pages).toBe(false);
    expect(res.body.request_capped).toBe(true);
    expect(res.body.metrics.requestCapped).toBe(true);
    expect(res.headers['x-rdd-request-capped']).toBe('1');
    expect(res.body.results).toHaveLength(20);
    expect(oauth.isDone()).toBe(true);
  });

  test('stops issuing new upstream requests after the first subreddit is rate limited', async () => {
    const firstSub = 'cooldownalpha';
    const otherSubs = ['cooldownbeta', 'cooldowngamma'];
    const oauth = nock('https://oauth.reddit.com');
    oauth
      .get(`/r/${firstSub}/about.json`)
      .reply(429, 'Too Many Requests', { 'Retry-After': '12' });

    const res = await runHandler(redditHandler, {
      method: 'GET',
      url: `/api/reddit?subs=${firstSub},${otherSubs.join(',')}&mode=top`,
      headers: {
        cookie: authCookie(),
        origin: 'http://localhost:3000',
      },
    });

    expect(res.status).toBe(200);
    expect(res.body.rate_limited).toBe(true);
    expect(res.body.retry_after_seconds).toBe(12);
    expect(res.body.results).toHaveLength(3);
    expect(res.body.results.every((result) => result.error_code === 'RATE_LIMITED')).toBe(true);
    expect(res.body.rate_limited_subreddits).toEqual([firstSub, ...otherSubs]);
    expect(res.body.metrics.rateLimitedCount).toBe(3);
    expect(oauth.isDone()).toBe(true);
  });

  test('reuses upstream cooldown across separate requests', async () => {
    const firstSub = 'sharedcooldownalpha';
    const secondSub = 'sharedcooldownbeta';
    const oauth = nock('https://oauth.reddit.com');

    oauth
      .get(`/r/${firstSub}/about.json`)
      .reply(429, 'Too Many Requests', { 'Retry-After': '8' });

    const firstResponse = await runHandler(redditHandler, {
      method: 'GET',
      url: `/api/reddit?subs=${firstSub}&mode=top`,
      headers: {
        cookie: authCookie(),
        origin: 'http://localhost:3000',
      },
    });

    const secondResponse = await runHandler(redditHandler, {
      method: 'GET',
      url: `/api/reddit?subs=${secondSub}&mode=top`,
      headers: {
        cookie: authCookie(),
        origin: 'http://localhost:3000',
      },
    });

    expect(firstResponse.status).toBe(200);
    expect(firstResponse.body.rate_limited).toBe(true);
    expect(secondResponse.status).toBe(200);
    expect(secondResponse.body.rate_limited).toBe(true);
    expect(secondResponse.body.rate_limited_subreddits).toEqual([secondSub]);
    expect(secondResponse.body.retry_after_seconds).toBeGreaterThan(0);
    expect(secondResponse.body.metrics.sharedCooldownHit).toBe(true);
    expect(secondResponse.body.metrics.redditRequestCount).toBe(0);
    expect(oauth.isDone()).toBe(true);
  });

  test('rejects requests above the server subreddit cap', async () => {
    const previousMax = process.env.REDDIT_MAX_SUBREDDITS;
    process.env.REDDIT_MAX_SUBREDDITS = '3';

    try {
      const res = await runHandler(redditHandler, {
        method: 'GET',
        url: '/api/reddit?subs=one,two,three,four&mode=top',
        headers: {
          cookie: authCookie(),
          origin: 'http://localhost:3000',
        },
      });

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({
        error: 'Too many subreddits',
        max_subreddits: 3,
        requested_subreddits: 4,
      });
    } finally {
      if (previousMax === undefined) {
        delete process.env.REDDIT_MAX_SUBREDDITS;
      } else {
        process.env.REDDIT_MAX_SUBREDDITS = previousMax;
      }
    }
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
