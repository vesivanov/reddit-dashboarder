const nock = require('nock');

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
    expect(advanceRes.body.summary.complete3dCount).toBe(0);
    expect(advanceRes.body.summary.complete5dCount).toBe(0);

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
      complete5dCount: 0,
    });
    expect(advanceRes.body.result.state).toMatchObject({
      complete_1d: true,
      complete_3d: true,
      complete_5d: false,
    });
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
});
