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

const {
  buildCoverageScopeId,
  createCoverageBundle,
  saveCoverageBundle,
  getCoverageBundle,
  recordCoveragePage,
  summarizeCoverageBundle,
} = require('../../../lib/repos/reddit-coverage');

describe('reddit coverage repo', () => {
  beforeEach(() => {
    mockStore.clear();
  });

  test('buildCoverageScopeId is order-insensitive for subreddit lists', () => {
    const a = buildCoverageScopeId({
      subreddits: ['smallbusiness', 'SaaS', 'Entrepreneur'],
      mode: 'new',
      time: 'day',
      days: 5,
      targetWindowDays: 5,
    });
    const b = buildCoverageScopeId({
      subreddits: ['entrepreneur', 'smallbusiness', 'saas'],
      mode: 'new',
      time: 'day',
      days: 5,
      targetWindowDays: 5,
    });

    expect(a).toBe(b);
  });

  test('recordCoveragePage merges posts by id and updates coverage summary', async () => {
    const scopeId = buildCoverageScopeId({
      subreddits: ['smallbusiness'],
      mode: 'new',
      time: 'day',
      days: 5,
      targetWindowDays: 5,
    });

    let bundle = createCoverageBundle({
      scopeId,
      subreddits: ['smallbusiness'],
      mode: 'new',
      time: 'day',
      days: 5,
      targetWindowDays: 5,
      now: Date.parse('2026-03-09T12:00:00.000Z'),
    });

    bundle = recordCoveragePage(bundle, 'smallbusiness', {
      posts: [
        { id: 'a', subreddit: 'smallbusiness', created_utc: Math.floor(Date.parse('2026-03-09T10:00:00.000Z') / 1000) },
        { id: 'b', subreddit: 'smallbusiness', created_utc: Math.floor(Date.parse('2026-03-08T09:00:00.000Z') / 1000) },
      ],
      nextAfter: 't3_after_1',
      done: false,
      targetWindowDays: 5,
      now: Date.parse('2026-03-09T12:00:00.000Z'),
    });

    bundle = recordCoveragePage(bundle, 'smallbusiness', {
      posts: [
        { id: 'a', subreddit: 'smallbusiness', created_utc: Math.floor(Date.parse('2026-03-09T10:00:00.000Z') / 1000) },
        { id: 'c', subreddit: 'smallbusiness', created_utc: Math.floor(Date.parse('2026-03-04T08:00:00.000Z') / 1000) },
      ],
      nextAfter: '',
      done: true,
      targetWindowDays: 5,
      now: Date.parse('2026-03-09T12:05:00.000Z'),
    });

    await saveCoverageBundle(bundle);
    const saved = await getCoverageBundle(scopeId);
    const summary = summarizeCoverageBundle(saved);

    expect(saved.postsBySubreddit.smallbusiness).toHaveLength(3);
    expect(summary.totalPosts).toBe(3);
    expect(summary.complete1dCount).toBe(1);
    expect(summary.complete3dCount).toBe(1);
    expect(summary.complete5dCount).toBe(1);
    expect(summary.subreddits[0]).toMatchObject({
      subreddit: 'smallbusiness',
      status: 'complete',
      page_count: 2,
      post_count: 3,
      complete_1d: true,
      complete_3d: true,
      complete_5d: true,
    });
  });
});
