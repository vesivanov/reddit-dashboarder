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

const { runHandler } = require('../../helpers/run-handler');
const jobsHandler = require('../../../lib/api-handlers/reddit/jobs');

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

describe('/api/reddit/jobs', () => {
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
    delete process.env.REDDIT_JOB_MAX_PAGES_PER_TICK;
    delete process.env.REDDIT_MAX_SUBREDDITS;
  });

  test('completes an exhaustive fetch across multiple polls', async () => {
    process.env.REDDIT_JOB_MAX_PAGES_PER_TICK = '1';
    const sub = 'programming';

    nock('https://www.reddit.com')
      .get(`/r/${sub}/about.json`)
      .reply(200, { data: { subscribers: 100, active_user_count: 10, title: sub, icon_img: null, public_description: '' } })
      .get(new RegExp(`^/r/${sub}/new\\.json`))
      .query((query) => !query.after)
      .reply(200, {
        data: {
          children: [buildPost(sub, 'post-1')],
          after: 't3_after1',
        },
      })
      .get(new RegExp(`^/r/${sub}/new\\.json`))
      .query((query) => query.after === 't3_after1')
      .reply(200, {
        data: {
          children: [buildPost(sub, 'post-2')],
          after: null,
        },
      });

    const createRes = await runHandler(jobsHandler, {
      method: 'POST',
      url: '/api/reddit/jobs',
      headers: { origin: 'http://localhost:3000' },
      body: {
        subs: [sub],
        mode: 'new',
        days: 1,
        limit: 25,
        max_pages: 'all',
      },
    });

    expect(createRes.status).toBe(202);
    const jobId = createRes.body.job.id;

    const poll1 = await runHandler(jobsHandler, {
      method: 'GET',
      url: `/api/reddit/jobs/${jobId}`,
      headers: { origin: 'http://localhost:3000' },
    });
    expect(poll1.status).toBe(200);
    expect(poll1.body.job.status).toBe('running');
    expect(poll1.body.job.progress.completedSubreddits).toBe(0);
    expect(poll1.body.job.results[0].posts).toHaveLength(1);

    const poll2 = await runHandler(jobsHandler, {
      method: 'GET',
      url: `/api/reddit/jobs/${jobId}`,
      headers: { origin: 'http://localhost:3000' },
    });
    expect(poll2.status).toBe(200);
    expect(poll2.body.job.status).toBe('completed');
    expect(poll2.body.job.progress.completedSubreddits).toBe(1);
    expect(poll2.body.job.results[0].posts).toHaveLength(2);
    expect(poll2.body.job.results[0].partial).toBe(false);
  });

  test('enforces a 50 subreddit cap for fetch jobs', async () => {
    process.env.REDDIT_MAX_SUBREDDITS = '50';
    const fifty = Array.from({ length: 50 }, (_, index) => `subreddit${index + 1}`);
    const fiftyOne = Array.from({ length: 51 }, (_, index) => `subreddit${index + 1}`);

    const allowed = await runHandler(jobsHandler, {
      method: 'POST',
      url: '/api/reddit/jobs',
      headers: { origin: 'http://localhost:3000' },
      body: {
        subs: fifty,
        mode: 'new',
        days: 1,
        limit: 25,
        max_pages: 1,
      },
    });
    expect(allowed.status).toBe(202);

    const rejected = await runHandler(jobsHandler, {
      method: 'POST',
      url: '/api/reddit/jobs',
      headers: { origin: 'http://localhost:3000' },
      body: {
        subs: fiftyOne,
        mode: 'new',
        days: 1,
        limit: 25,
        max_pages: 1,
      },
    });
    expect(rejected.status).toBe(400);
    expect(rejected.body.error).toBe('Too many subreddits');
    expect(rejected.body.max_subreddits).toBe(50);
  });
});
