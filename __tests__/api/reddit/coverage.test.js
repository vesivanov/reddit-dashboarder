const nock = require('nock');

const mockStore = new Map();

jest.mock('../../../lib/storage', () => ({
  get: jest.fn(async (key) => mockStore.get(key) ?? null),
  set: jest.fn(async (key, value) => {
    mockStore.set(key, value);
  }),
  compareAndSwap: jest.fn(async (key, expectedValue, nextValue) => {
    const current = mockStore.get(key) ?? null;
    const expectedSerialized = expectedValue === undefined ? undefined : JSON.stringify(expectedValue);
    const currentSerialized = current === null ? JSON.stringify(null) : JSON.stringify(current);
    if (expectedSerialized !== undefined && expectedSerialized !== currentSerialized) {
      return { ok: false, current };
    }
    mockStore.set(key, nextValue);
    return { ok: true, current };
  }),
  delete: jest.fn(async (key) => {
    mockStore.delete(key);
  }),
}));

const coverageHandler = require('../../../lib/api-handlers/reddit/coverage');
const { buildCoverageKey, buildCoverageScopeId } = require('../../../lib/repos/reddit-coverage');
const { runHandler } = require('../../helpers/run-handler');

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

describe('/api/reddit/coverage + /api/reddit/advance', () => {
  beforeAll(() => {
    nock.disableNetConnect();
    nock.enableNetConnect('127.0.0.1');
  });

  afterAll(() => {
    nock.enableNetConnect();
  });

  beforeEach(() => {
    mockStore.clear();
    nock.cleanAll();
    delete process.env.REDDIT_MAX_SUBREDDITS;
    delete process.env.REDDIT_COVERAGE_FRESHNESS_MS;
    delete process.env.REDDIT_ADVANCE_ROUTE_BUDGET_MS;
    delete process.env.REDDIT_ADVANCE_META_TIMEOUT_MS;
    delete process.env.REDDIT_ADVANCE_TOKEN_TIMEOUT_MS;
    delete process.env.REDDIT_ALLOW_PUBLIC_FALLBACK;
  });

  test('returns an empty coverage summary when scope has not been created yet', async () => {
    const res = await runHandler(coverageHandler, {
      method: 'GET',
      url: '/api/reddit/coverage?subs=programming,smallbusiness&mode=new&days=5&target_window_days=5',
      headers: { origin: 'http://localhost:3000' },
    });

    expect(res.status).toBe(200);
    expect(res.body.summary).toMatchObject({
      totalSubreddits: 2,
      complete1dCount: 0,
      complete3dCount: 0,
      complete5dCount: 0,
      totalPosts: 0,
    });
    expect(res.body.results).toEqual([]);
  });

  test('returns 401 instead of falling back to public Reddit when public fallback is disabled', async () => {
    process.env.REDDIT_ALLOW_PUBLIC_FALLBACK = 'false';

    const advanceRes = await runHandler(coverageHandler, {
      method: 'POST',
      url: '/api/reddit/advance',
      headers: { origin: 'http://localhost:3000' },
      body: {
        subs: ['programming'],
        sub: 'programming',
        mode: 'new',
        days: 1,
        target_window_days: 1,
        limit: 15,
      },
    });

    expect(advanceRes.status).toBe(401);
    expect(advanceRes.body).toMatchObject({
      error: 'Not authenticated',
    });
  });

  test('advances subreddit coverage and persists merged results for later reads', async () => {
    const sub = 'programming';
    const now = Math.floor(Date.now() / 1000);

    nock('https://www.reddit.com')
      .get(`/r/${sub}/about.json`)
      .reply(200, { data: { subscribers: 100, active_user_count: 10, title: sub, icon_img: null, public_description: '' } })
      .get(new RegExp(`^/r/${sub}/new\\.json`))
      .query((query) => String(query.limit) === '15' && !query.after)
      .reply(200, {
        data: {
          children: [
            buildPost(sub, 'post-1', now - 60),
            buildPost(sub, 'post-2', now - (2 * 86400)),
          ],
          after: null,
        },
      });

    const advanceRes = await runHandler(coverageHandler, {
      method: 'POST',
      url: '/api/reddit/advance',
      headers: { origin: 'http://localhost:3000' },
      body: {
        subs: [sub],
        sub,
        mode: 'new',
        days: 5,
        target_window_days: 5,
        limit: 15,
      },
    });

    expect(advanceRes.status).toBe(200);
    expect(advanceRes.body.advanced).toBe(true);
    expect(advanceRes.body.result).toMatchObject({
      subreddit: sub,
      posts: expect.any(Array),
    });
    expect(advanceRes.body.result.posts).toHaveLength(2);
    expect(advanceRes.body.summary.complete1dCount).toBe(1);
    expect(advanceRes.body.summary.complete3dCount).toBe(1);
    expect(advanceRes.body.summary.complete5dCount).toBe(1);

    const coverageRes = await runHandler(coverageHandler, {
      method: 'GET',
      url: '/api/reddit/coverage?subs=programming&mode=new&days=5&target_window_days=5',
      headers: { origin: 'http://localhost:3000' },
    });

    expect(coverageRes.status).toBe(200);
    expect(coverageRes.body.summary.totalPosts).toBe(2);
    expect(coverageRes.body.results).toHaveLength(1);
    expect(coverageRes.body.results[0]).toMatchObject({
      subreddit: sub,
      state: expect.objectContaining({
        status: 'complete',
        post_count: 2,
      }),
      posts: expect.arrayContaining([
        expect.objectContaining({ id: 'post-1' }),
        expect.objectContaining({ id: 'post-2' }),
      ]),
    });
  });

  test('stores cooldown state after a Reddit rate limit', async () => {
    const sub = 'smallbusiness';

    nock('https://www.reddit.com')
      .get(`/r/${sub}/about.json`)
      .reply(200, { data: { subscribers: 100, active_user_count: 10, title: sub, icon_img: null, public_description: '' } })
      .get(new RegExp(`^/r/${sub}/new\\.json`))
      .query(true)
      .reply(429, {}, { 'retry-after': '12' });

    const advanceRes = await runHandler(coverageHandler, {
      method: 'POST',
      url: '/api/reddit/advance',
      headers: { origin: 'http://localhost:3000' },
      body: {
        subs: [sub],
        sub,
        mode: 'new',
        days: 1,
        target_window_days: 1,
        limit: 15,
      },
    });

    expect(advanceRes.status).toBe(200);
    expect(advanceRes.body.advanced).toBe(false);
    expect(advanceRes.body.rate_limited).toBe(true);
    expect(advanceRes.body.retryAfter).toBe(12);
    expect(advanceRes.body.result).toMatchObject({
      subreddit: sub,
      state: expect.objectContaining({
        status: 'cooldown',
      }),
    });
    expect(advanceRes.body.summary.subreddits[0]).toMatchObject({
      subreddit: sub,
      status: 'cooldown',
      last_error: 'RATE_LIMITED',
    });

    const coverageRes = await runHandler(coverageHandler, {
      method: 'GET',
      url: '/api/reddit/coverage?subs=smallbusiness&mode=new&days=1&target_window_days=1',
      headers: { origin: 'http://localhost:3000' },
    });

    expect(coverageRes.status).toBe(200);
    expect(coverageRes.body.results[0].state).toMatchObject({
      subreddit: sub,
      status: 'cooldown',
      last_error: 'RATE_LIMITED',
    });
  });

  test('continues advancing when subreddit metadata times out', async () => {
    const sub = 'slowmeta';
    const now = Math.floor(Date.now() / 1000);
    process.env.REDDIT_ADVANCE_META_TIMEOUT_MS = '1';

    nock('https://www.reddit.com')
      .get(`/r/${sub}/about.json`)
      .delay(25)
      .reply(200, { data: { subscribers: 100, active_user_count: 10, title: sub, icon_img: null, public_description: '' } })
      .get(new RegExp(`^/r/${sub}/new\\.json`))
      .query(true)
      .reply(200, {
        data: {
          children: [buildPost(sub, 'post-1', now - 60)],
          after: null,
        },
      });

    const advanceRes = await runHandler(coverageHandler, {
      method: 'POST',
      url: '/api/reddit/advance',
      headers: { origin: 'http://localhost:3000' },
      body: {
        subs: [sub],
        sub,
        mode: 'new',
        days: 1,
        target_window_days: 1,
        limit: 15,
      },
    });

    expect(advanceRes.status).toBe(200);
    expect(advanceRes.body.advanced).toBe(true);
    expect(advanceRes.body.result.posts).toHaveLength(1);
    expect(advanceRes.body.result.state.meta).toEqual(expect.objectContaining({
      title: expect.any(String),
    }));
  });

  test('returns a soft timeout response when advance work exceeds the route budget', async () => {
    const subs = Array.from({ length: 12 }, (_, index) => `rushsub${index}`);
    const sub = subs[0];
    process.env.REDDIT_ADVANCE_ROUTE_BUDGET_MS = '2000';

    nock('https://www.reddit.com')
      .get(new RegExp(`^/r/${sub}/new\\.json`))
      .query(true)
      .delay(2500)
      .reply(200, {
        data: {
          children: [buildPost(sub, 'post-1')],
          after: null,
        },
      });

    const advanceRes = await runHandler(coverageHandler, {
      method: 'POST',
      url: '/api/reddit/advance',
      headers: { origin: 'http://localhost:3000' },
      body: {
        subs,
        sub,
        mode: 'new',
        days: 1,
        target_window_days: 1,
        limit: 15,
      },
    });

    expect(advanceRes.status).toBe(200);
    expect(advanceRes.body.advanced).toBe(false);
    expect(advanceRes.body.result).toMatchObject({
      subreddit: sub,
      timed_out: true,
    });
    expect(advanceRes.body.result.state).toMatchObject({
      status: 'timeout',
    });
  });

  test('resets stale completed coverage before returning cached state', async () => {
    const sub = 'stalealpha';
    const scopeId = buildCoverageScopeId({
      subreddits: [sub],
      mode: 'new',
      time: 'day',
      days: 1,
      targetWindowDays: 1,
    });
    process.env.REDDIT_COVERAGE_FRESHNESS_MS = '60000';

    mockStore.set(buildCoverageKey(scopeId), {
      scopeId,
      mode: 'new',
      time: 'day',
      days: 1,
      targetWindowDays: 1,
      createdAt: Date.now() - 10 * 60 * 1000,
      updatedAt: Date.now() - 10 * 60 * 1000,
      subreddits: [{
        subreddit: sub,
        status: 'complete',
        next_after: '',
        cooldown_until: null,
        covered_through_utc: Math.floor(Date.now() / 1000) - 86400,
        page_count: 2,
        post_count: 1,
        last_fetch_at: Date.now() - 10 * 60 * 1000,
        last_error: null,
        complete_1d: true,
        complete_3d: false,
        complete_5d: false,
        inflight_until: null,
        inflight_token: null,
        meta: { title: `r/${sub}`, subscribers: 123 },
      }],
      postsBySubreddit: {
        [sub]: [{
          id: 'stale-post',
          subreddit: sub,
          title: 'Old cached post',
          created_utc: Math.floor(Date.now() / 1000) - 3600,
        }],
      },
    });

    const coverageRes = await runHandler(coverageHandler, {
      method: 'GET',
      url: `/api/reddit/coverage?subs=${sub}&mode=new&days=1&target_window_days=1`,
      headers: { origin: 'http://localhost:3000' },
    });

    expect(coverageRes.status).toBe(200);
    expect(coverageRes.body.summary).toMatchObject({
      complete1dCount: 0,
      totalPosts: 0,
    });
    expect(coverageRes.body.results[0]).toMatchObject({
      subreddit: sub,
      state: expect.objectContaining({
        status: 'idle',
        page_count: 0,
        post_count: 0,
        complete_1d: false,
      }),
      posts: [],
    });
    expect(coverageRes.body.results[0].state.meta).toMatchObject({
      title: `r/${sub}`,
      subscribers: 123,
    });
  });

  test('resumes from the saved cursor after a cooldown expires', async () => {
    const sub = 'resumetest';
    const now = Math.floor(Date.now() / 1000);
    const scopeId = buildCoverageScopeId({
      subreddits: [sub],
      mode: 'new',
      time: 'day',
      days: 5,
      targetWindowDays: 5,
    });

    nock('https://www.reddit.com')
      .get(`/r/${sub}/about.json`)
      .reply(200, { data: { subscribers: 100, active_user_count: 10, title: sub, icon_img: null, public_description: '' } })
      .get(new RegExp(`^/r/${sub}/new\\.json`))
      .query((query) => String(query.limit) === '15' && !query.after)
      .reply(200, {
        data: {
          children: [buildPost(sub, 'post-1', now - 60)],
          after: 'page-2',
        },
      })
      .get(new RegExp(`^/r/${sub}/new\\.json`))
      .query((query) => String(query.limit) === '15' && query.after === 'page-2')
      .reply(429, {}, { 'retry-after': '12' })
      .get(new RegExp(`^/r/${sub}/new\\.json`))
      .query((query) => String(query.limit) === '15' && query.after === 'page-2')
      .reply(200, {
        data: {
          children: [buildPost(sub, 'post-2', now - (4 * 86400))],
          after: null,
        },
      });

    const firstAdvance = await runHandler(coverageHandler, {
      method: 'POST',
      url: '/api/reddit/advance',
      headers: { origin: 'http://localhost:3000' },
      body: {
        subs: [sub],
        sub,
        mode: 'new',
        days: 5,
        target_window_days: 5,
        limit: 15,
      },
    });

    expect(firstAdvance.status).toBe(200);
    expect(firstAdvance.body.advanced).toBe(true);
    expect(firstAdvance.body.result.state).toMatchObject({
      next_after: 'page-2',
      status: 'active',
    });

    const rateLimitedAdvance = await runHandler(coverageHandler, {
      method: 'POST',
      url: '/api/reddit/advance',
      headers: { origin: 'http://localhost:3000' },
      body: {
        subs: [sub],
        sub,
        mode: 'new',
        days: 5,
        target_window_days: 5,
        limit: 15,
      },
    });

    expect(rateLimitedAdvance.status).toBe(200);
    expect(rateLimitedAdvance.body.rate_limited).toBe(true);
    expect(rateLimitedAdvance.body.result.state).toMatchObject({
      next_after: 'page-2',
      status: 'cooldown',
    });

    const storedBundle = mockStore.get(buildCoverageKey(scopeId));
    mockStore.set(buildCoverageKey(scopeId), {
      ...storedBundle,
      subreddits: storedBundle.subreddits.map((entry) => (
        entry.subreddit === sub
          ? { ...entry, cooldown_until: Date.now() - 1000 }
          : entry
      )),
    });

    const resumedAdvance = await runHandler(coverageHandler, {
      method: 'POST',
      url: '/api/reddit/advance',
      headers: { origin: 'http://localhost:3000' },
      body: {
        subs: [sub],
        sub,
        mode: 'new',
        days: 5,
        target_window_days: 5,
        limit: 15,
      },
    });

    expect(resumedAdvance.status).toBe(200);
    expect(resumedAdvance.body.advanced).toBe(true);
    expect(resumedAdvance.body.result.posts).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'post-1' }),
      expect.objectContaining({ id: 'post-2' }),
    ]));
    expect(resumedAdvance.body.result.state).toMatchObject({
      status: 'complete',
      next_after: '',
      cooldown_until: null,
      last_error: null,
      post_count: 2,
    });
  });

  test('tracks 3 day coverage separately from 5 day coverage', async () => {
    const sub = 'saas';
    const now = Math.floor(Date.now() / 1000);

    nock('https://www.reddit.com')
      .get(`/r/${sub}/about.json`)
      .reply(200, { data: { subscribers: 100, active_user_count: 10, title: sub, icon_img: null, public_description: '' } })
      .get(new RegExp(`^/r/${sub}/new\\.json`))
      .query(true)
      .reply(200, {
        data: {
          children: [
            buildPost(sub, 'post-1', now - 60),
            buildPost(sub, 'post-2', now - (4 * 86400)),
          ],
          after: null,
        },
      });

    const advanceRes = await runHandler(coverageHandler, {
      method: 'POST',
      url: '/api/reddit/advance',
      headers: { origin: 'http://localhost:3000' },
      body: {
        subs: [sub],
        sub,
        mode: 'new',
        days: 5,
        target_window_days: 3,
        limit: 15,
      },
    });

    expect(advanceRes.status).toBe(200);
    expect(advanceRes.body.summary).toMatchObject({
      complete1dCount: 1,
      complete3dCount: 1,
      complete5dCount: 1,
    });
    expect(advanceRes.body.result.state).toMatchObject({
      complete_1d: true,
      complete_3d: true,
      complete_5d: true,
    });
  });

  test('marks 1 day coverage complete when a page crosses the cutoff even if older posts are filtered out', async () => {
    const sub = 'sparsefresh';
    const now = Math.floor(Date.now() / 1000);

    nock('https://www.reddit.com')
      .get(`/r/${sub}/about.json`)
      .reply(200, { data: { subscribers: 100, active_user_count: 10, title: sub, icon_img: null, public_description: '' } })
      .get(new RegExp(`^/r/${sub}/new\\.json`))
      .query(true)
      .reply(200, {
        data: {
          children: [
            buildPost(sub, 'recent-post', now - 60),
            buildPost(sub, 'older-post', now - (2 * 86400)),
          ],
          after: 'page-2-that-should-not-be-needed',
        },
      });

    const advanceRes = await runHandler(coverageHandler, {
      method: 'POST',
      url: '/api/reddit/advance',
      headers: { origin: 'http://localhost:3000' },
      body: {
        subs: [sub],
        sub,
        mode: 'new',
        days: 1,
        target_window_days: 1,
        limit: 15,
      },
    });

    expect(advanceRes.status).toBe(200);
    expect(advanceRes.body.result.posts).toHaveLength(1);
    expect(advanceRes.body.result.state).toMatchObject({
      status: 'complete',
      complete_1d: true,
      complete_3d: false,
      complete_5d: false,
    });
    expect(advanceRes.body.summary).toMatchObject({
      complete1dCount: 1,
      complete3dCount: 0,
      complete5dCount: 0,
    });
  });

  test('marks the requested window complete when the listing is exhausted without in-window posts', async () => {
    const sub = 'quietsub';
    const now = Math.floor(Date.now() / 1000);

    nock('https://www.reddit.com')
      .get(`/r/${sub}/about.json`)
      .reply(200, { data: { subscribers: 100, active_user_count: 10, title: sub, icon_img: null, public_description: '' } })
      .get(new RegExp(`^/r/${sub}/new\\.json`))
      .query(true)
      .reply(200, {
        data: {
          children: [
            buildPost(sub, 'older-post', now - (2 * 86400)),
          ],
          after: null,
        },
      });

    const advanceRes = await runHandler(coverageHandler, {
      method: 'POST',
      url: '/api/reddit/advance',
      headers: { origin: 'http://localhost:3000' },
      body: {
        subs: [sub],
        sub,
        mode: 'new',
        days: 1,
        target_window_days: 1,
        limit: 15,
      },
    });

    expect(advanceRes.status).toBe(200);
    expect(advanceRes.body.result.posts).toEqual([]);
    expect(advanceRes.body.result.state).toMatchObject({
      status: 'complete',
      complete_1d: true,
      complete_3d: false,
      complete_5d: false,
      post_count: 0,
    });
    expect(advanceRes.body.summary.complete1dCount).toBe(1);
  });

  test('advances top-mode coverage across pages and keeps all returned posts', async () => {
    const sub = 'toprunner';
    const now = Math.floor(Date.now() / 1000);

    nock('https://www.reddit.com')
      .get(`/r/${sub}/about.json`)
      .reply(200, { data: { subscribers: 100, active_user_count: 10, title: sub, icon_img: null, public_description: '' } })
      .get(new RegExp(`^/r/${sub}/top\\.json`))
      .query((query) => String(query.limit) === '15' && String(query.t) === 'week' && !query.after)
      .reply(200, {
        data: {
          children: [buildPost(sub, 'top-post-1', now - 60)],
          after: 'page-2',
        },
      })
      .get(new RegExp(`^/r/${sub}/top\\.json`))
      .query((query) => String(query.limit) === '15' && String(query.t) === 'week' && query.after === 'page-2')
      .reply(200, {
        data: {
          children: [buildPost(sub, 'top-post-2', now - (10 * 86400))],
          after: null,
        },
      });

    const firstAdvance = await runHandler(coverageHandler, {
      method: 'POST',
      url: '/api/reddit/advance',
      headers: { origin: 'http://localhost:3000' },
      body: {
        subs: [sub],
        sub,
        mode: 'top',
        time: 'week',
        days: 1,
        target_window_days: 1,
        limit: 15,
      },
    });

    expect(firstAdvance.status).toBe(200);
    expect(firstAdvance.body.advanced).toBe(true);
    expect(firstAdvance.body.result.state).toMatchObject({
      status: 'active',
      next_after: 'page-2',
      post_count: 1,
    });
    expect(firstAdvance.body.result.posts).toEqual([
      expect.objectContaining({ id: 'top-post-1' }),
    ]);

    const secondAdvance = await runHandler(coverageHandler, {
      method: 'POST',
      url: '/api/reddit/advance',
      headers: { origin: 'http://localhost:3000' },
      body: {
        subs: [sub],
        sub,
        mode: 'top',
        time: 'week',
        days: 1,
        target_window_days: 1,
        limit: 15,
      },
    });

    expect(secondAdvance.status).toBe(200);
    expect(secondAdvance.body.advanced).toBe(true);
    expect(secondAdvance.body.result.state).toMatchObject({
      status: 'complete',
      next_after: '',
      post_count: 2,
    });
    expect(secondAdvance.body.result.posts).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'top-post-1' }),
      expect.objectContaining({ id: 'top-post-2' }),
    ]));
  });

  test('enforces the subreddit cap on coverage endpoints', async () => {
    process.env.REDDIT_MAX_SUBREDDITS = '50';
    const fiftyOne = Array.from({ length: 51 }, (_, index) => `subreddit${index + 1}`);

    const getRes = await runHandler(coverageHandler, {
      method: 'GET',
      url: `/api/reddit/coverage?subs=${fiftyOne.join(',')}`,
      headers: { origin: 'http://localhost:3000' },
    });
    expect(getRes.status).toBe(400);
    expect(getRes.body).toMatchObject({
      error: 'Too many subreddits',
      max_subreddits: 50,
    });

    const postRes = await runHandler(coverageHandler, {
      method: 'POST',
      url: '/api/reddit/advance',
      headers: { origin: 'http://localhost:3000' },
      body: {
        subs: fiftyOne,
        sub: 'subreddit1',
        mode: 'new',
        days: 1,
      },
    });
    expect(postRes.status).toBe(400);
    expect(postRes.body).toMatchObject({
      error: 'Too many subreddits',
      max_subreddits: 50,
    });
  });

  test('deletes persisted coverage for a force refresh', async () => {
    const sub = 'programming';
    const now = Math.floor(Date.now() / 1000);

    nock('https://www.reddit.com')
      .get(`/r/${sub}/about.json`)
      .reply(200, { data: { subscribers: 100, active_user_count: 10, title: sub, icon_img: null, public_description: '' } })
      .get(new RegExp(`^/r/${sub}/new\\.json`))
      .query(true)
      .reply(200, {
        data: {
          children: [buildPost(sub, 'post-1', now - 60)],
          after: null,
        },
      });

    const advanceRes = await runHandler(coverageHandler, {
      method: 'POST',
      url: '/api/reddit/advance',
      headers: { origin: 'http://localhost:3000' },
      body: {
        subs: [sub],
        sub,
        mode: 'new',
        days: 1,
        target_window_days: 1,
        limit: 15,
      },
    });
    expect(advanceRes.status).toBe(200);

    const deleteRes = await runHandler(coverageHandler, {
      method: 'DELETE',
      url: '/api/reddit/coverage?subs=programming&mode=new&days=1&target_window_days=1',
      headers: { origin: 'http://localhost:3000' },
    });
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.success).toBe(true);

    const coverageRes = await runHandler(coverageHandler, {
      method: 'GET',
      url: '/api/reddit/coverage?subs=programming&mode=new&days=1&target_window_days=1',
      headers: { origin: 'http://localhost:3000' },
    });
    expect(coverageRes.status).toBe(200);
    expect(coverageRes.body.results).toEqual([]);
    expect(coverageRes.body.summary.totalPosts).toBe(0);
  });

  test('merges concurrent advances for the same scope without dropping one subreddit', async () => {
    const subs = ['alphaengineers', 'betabuilders'];
    const now = Math.floor(Date.now() / 1000);

    nock('https://www.reddit.com')
      .get(`/r/${subs[0]}/about.json`)
      .reply(200, { data: { subscribers: 100, active_user_count: 10, title: subs[0], icon_img: null, public_description: '' } })
      .get(`/r/${subs[1]}/about.json`)
      .reply(200, { data: { subscribers: 120, active_user_count: 12, title: subs[1], icon_img: null, public_description: '' } })
      .get(new RegExp(`^/r/${subs[0]}/new\\.json`))
      .query(true)
      .delay(20)
      .reply(200, {
        data: {
          children: [buildPost(subs[0], `${subs[0]}-1`, now - 60)],
          after: null,
        },
      })
      .get(new RegExp(`^/r/${subs[1]}/new\\.json`))
      .query(true)
      .delay(5)
      .reply(200, {
        data: {
          children: [buildPost(subs[1], `${subs[1]}-1`, now - 120)],
          after: null,
        },
      });

    const [firstAdvance, secondAdvance] = await Promise.all(subs.map((sub) => runHandler(coverageHandler, {
      method: 'POST',
      url: '/api/reddit/advance',
      headers: { origin: 'http://localhost:3000' },
      body: {
        subs,
        sub,
        mode: 'new',
        days: 1,
        target_window_days: 1,
        limit: 15,
      },
    })));

    expect(firstAdvance.status).toBe(200);
    expect(secondAdvance.status).toBe(200);

    const scopeId = buildCoverageScopeId({
      subreddits: subs,
      mode: 'new',
      time: 'day',
      days: 1,
      targetWindowDays: 1,
    });
    const storedBundle = mockStore.get(buildCoverageKey(scopeId));

    expect(storedBundle.postsBySubreddit[subs[0]]).toHaveLength(1);
    expect(storedBundle.postsBySubreddit[subs[1]]).toHaveLength(1);
    expect(storedBundle.subreddits.find((entry) => entry.subreddit === subs[0])).toMatchObject({
      post_count: 1,
      status: 'complete',
    });
    expect(storedBundle.subreddits.find((entry) => entry.subreddit === subs[1])).toMatchObject({
      post_count: 1,
      status: 'complete',
    });
  });
});
