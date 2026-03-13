const { describe, test, expect, beforeEach } = require('@jest/globals');

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
const { makeSignedCookie } = require('../../../lib/cookies');
const snapshotHandler = require('../../../lib/api-v1/handlers/snapshot');
const { buildCoverageKey } = require('../../../lib/repos/reddit-coverage');
const storage = require('../../../lib/storage');

describe('workspace snapshot handler', () => {
  beforeEach(() => {
    process.env.AGENT_API_KEY = 'agent-test-key';
    process.env.DIGEST_SYNC_TOKEN = 'sync-token';
    process.env.SESSION_COOKIE_SECRET = 'test_secret_32_bytes_long_hex_string_123456';
    mockStore.clear();
    storage.set.mockImplementation(async (key, value) => {
      mockStore.set(key, value);
    });
  });

  test('supports workspace-scoped snapshot reads', async () => {
    mockStore.set('agent-workspace:ws_demo', {
      workspaceId: 'ws_demo',
      sourceSyncToken: 'sync-token',
      createdAt: '2026-03-08T10:00:00.000Z',
      updatedAt: '2026-03-08T10:00:00.000Z',
    });
    mockStore.set('agent-snapshot-latest:ws_demo', {
      snapshotId: 'snap_ws_demo_1',
      scopeId: 'ws_demo',
      sourceSyncedAt: '2026-03-08T10:00:00.000Z',
    });
    mockStore.set('agent-snapshot:snap_ws_demo_1', {
      snapshotId: 'snap_ws_demo_1',
      scopeId: 'ws_demo',
      sourceSyncToken: 'sync-token',
      sourceSyncedAt: '2026-03-08T10:00:00.000Z',
      createdAt: '2026-03-08T10:00:00.000Z',
      expiresAt: Date.parse('2026-03-09T10:00:00.000Z'),
      posts: [{ id: 'p1', title: 'Post', subreddit: 'programming' }],
      filters: {},
    });

    const res = await runHandler(snapshotHandler, {
      method: 'GET',
      url: '/api/workspaces/ws_demo/snapshot',
      params: { workspaceId: 'ws_demo' },
      headers: {
        authorization: 'Bearer agent-test-key',
        origin: 'http://localhost:3000',
      },
    });

    expect(res.status).toBe(200);
    expect(res.body.data.snapshot).toMatchObject({
      id: 'snap_ws_demo_1',
      workspaceId: 'ws_demo',
    });
  });

  test('supports workspace-scoped snapshot writes for authenticated browser sessions', async () => {
    const accessCookie = makeSignedCookie('access', 'access-token');
    mockStore.set('agent-workspace:ws_demo', {
      workspaceId: 'ws_demo',
      sourceSyncToken: 'sync-token',
      createdAt: '2026-03-08T10:00:00.000Z',
      updatedAt: '2026-03-08T10:00:00.000Z',
    });

    const res = await runHandler(snapshotHandler, {
      method: 'PUT',
      url: '/api/workspaces/ws_demo/snapshot',
      params: { workspaceId: 'ws_demo' },
      headers: {
        cookie: accessCookie.split(';')[0],
        origin: 'http://localhost:3000',
      },
      body: {
        token: 'sync-token',
        posts: [{ id: 'p2', title: 'Need help now', subreddit: 'seo' }],
        settings: {
          subreddits: ['seo'],
          aiGoals: 'Find urgent SEO leads',
        },
        filters: { minScore: 5 },
        timestamp: '2026-03-08T10:10:00.000Z',
      },
    });

    expect(res.status).toBe(200);
    expect(res.body.workspaceId).toBe('ws_demo');
    expect(mockStore.get('sync-token')).toMatchObject({
      token: 'sync-token',
      settings: { subreddits: ['seo'], aiGoals: 'Find urgent SEO leads' },
    });
    expect(mockStore.get('agent-snapshot-latest:ws_demo')).toBeUndefined();
  });

  test('materializes workspace snapshot posts from a persisted reddit coverage scope', async () => {
    const accessCookie = makeSignedCookie('access', 'access-token');
    mockStore.set('agent-workspace:ws_demo', {
      workspaceId: 'ws_demo',
      sourceSyncToken: 'sync-token',
      createdAt: '2026-03-08T10:00:00.000Z',
      updatedAt: '2026-03-08T10:00:00.000Z',
    });
    mockStore.set(buildCoverageKey('rcov_demo_scope'), {
      scopeId: 'rcov_demo_scope',
      mode: 'new',
      time: 'day',
      days: 1,
      targetWindowDays: 1,
      createdAt: Date.parse('2026-03-08T10:00:00.000Z'),
      updatedAt: Date.parse('2026-03-08T10:00:00.000Z'),
      subreddits: [{
        subreddit: 'seo',
        status: 'complete',
        next_after: '',
        cooldown_until: null,
        covered_through_utc: Math.floor(Date.parse('2026-03-08T09:00:00.000Z') / 1000),
        page_count: 1,
        post_count: 1,
        last_fetch_at: Date.parse('2026-03-08T10:00:00.000Z'),
        last_error: null,
        complete_1d: true,
        complete_3d: false,
        complete_5d: false,
        inflight_until: null,
        inflight_token: null,
        meta: { title: 'r/seo', subscribers: 200 },
      }],
      postsBySubreddit: {
        seo: [{
          id: 'p_cov_1',
          title: 'Need SEO help now',
          subreddit: 'seo',
          author: 'alice',
          score: 12,
          num_comments: 4,
          created_utc: Math.floor(Date.parse('2026-03-08T09:30:00.000Z') / 1000),
          reddit_url: 'https://reddit.com/r/seo/comments/p_cov_1',
        }],
      },
    });

    const res = await runHandler(snapshotHandler, {
      method: 'PUT',
      url: '/api/workspaces/ws_demo/snapshot',
      params: { workspaceId: 'ws_demo' },
      headers: {
        cookie: accessCookie.split(';')[0],
        origin: 'http://localhost:3000',
      },
      body: {
        token: 'sync-token',
        settings: {
          subreddits: ['seo'],
          aiGoals: 'Find urgent SEO leads',
        },
        filters: { minScore: 5 },
        source: {
          type: 'reddit_coverage',
          coverageScopeId: 'rcov_demo_scope',
          mode: 'new',
          time: 'day',
          days: 1,
          targetWindowDays: 1,
          subreddits: ['seo'],
        },
        timestamp: '2026-03-08T10:10:00.000Z',
      },
    });

    expect(res.status).toBe(200);
    expect(res.body.workspaceId).toBe('ws_demo');
    expect(res.body.postCount).toBe(1);
    expect(mockStore.get('sync-token')).toMatchObject({
      token: 'sync-token',
      source: {
        type: 'reddit_coverage',
        coverageScopeId: 'rcov_demo_scope',
      },
      posts: [],
      settings: { subreddits: ['seo'], aiGoals: 'Find urgent SEO leads' },
    });

    expect(res.body.snapshotId).toBeTruthy();
    expect(mockStore.get('agent-snapshot-latest:ws_demo')).toBeUndefined();
  });

  test('materializes snapshot, config, and heuristic analysis for a workspace route', async () => {
    mockStore.set('agent-workspace:ws_demo', {
      workspaceId: 'ws_demo',
      sourceSyncToken: 'sync-token',
      createdAt: '2026-03-08T10:00:00.000Z',
      updatedAt: '2026-03-08T10:00:00.000Z',
    });
    mockStore.set('sync-token', {
      token: 'sync-token',
      posts: [
        {
          id: 'p1',
          title: 'Looking for SEO help fast',
          selftext: 'Need help with rankings this week',
          subreddit: 'smallbusiness',
          author: 'alice',
          score: 24,
          num_comments: 8,
          created_utc: Math.floor(Date.now() / 1000) - 3600,
          reddit_url: 'https://reddit.com/r/smallbusiness/comments/p1',
          aiScoreProxy: 4,
        },
      ],
      settings: {
        subreddits: ['smallbusiness'],
        aiGoals: 'Find SEO leads',
        aiThreshold: 4,
        openRouterModel: 'openai/gpt-4o-mini',
        opportunityConfig: {
          businessOffering: 'SEO consulting',
          idealCustomer: 'Small business owners',
          problemsSolved: 'Traffic drops',
          preferredEngagement: 'reply',
          strategyPreset: 'sales',
          opportunityTypes: ['lead', 'pain_point'],
          strictness: 'balanced',
        },
      },
      filters: { minScore: 10 },
      syncedAt: '2026-03-08T10:00:00.000Z',
      timestamp: '2026-03-08T09:59:00.000Z',
      expiresAt: Date.parse('2026-03-09T10:00:00.000Z'),
    });

    const res = await runHandler(snapshotHandler, {
      method: 'GET',
      url: '/api/workspaces/ws_demo/snapshot',
      params: { workspaceId: 'ws_demo' },
      headers: {
        authorization: 'Bearer agent-test-key',
        origin: 'http://localhost:3000',
      },
    });

    expect(res.status).toBe(200);
    expect(res.body.data.snapshot).toMatchObject({
      workspaceId: 'ws_demo',
      sourceSyncToken: 'sync-token',
      sourceSyncedAt: '2026-03-08T10:00:00.000Z',
    });
    expect(res.body.data.config).toMatchObject({
      subreddits: ['smallbusiness'],
      goals: 'Find SEO leads',
      aiContext: '',
      opportunityConfig: {
        businessOffering: 'SEO consulting',
        idealCustomer: 'Small business owners',
        problemsSolved: 'Traffic drops',
        preferredEngagement: 'reply',
        strategyPreset: 'sales',
        opportunityTypes: ['lead', 'pain_point'],
        strictness: 'balanced',
      },
      scoringConfig: null,
      threshold: 4,
      model: 'openai/gpt-4o-mini',
      version: 1,
    });
    expect(res.body.data.analysis).toMatchObject({
      status: 'heuristic_only',
      source: 'heuristic',
      opportunityCount: 1,
      totalPosts: 1,
    });

    expect(mockStore.get('agent-snapshot-latest:ws_demo')).toBeUndefined();
    expect(mockStore.get('agent-config:ws_demo')).toBeUndefined();
  });

  test('returns persisted analysis state for a workspace route when available', async () => {
    mockStore.set('agent-workspace:ws_demo', {
      workspaceId: 'ws_demo',
      sourceSyncToken: 'sync-token',
      createdAt: '2026-03-08T10:00:00.000Z',
      updatedAt: '2026-03-08T10:00:00.000Z',
    });
    mockStore.set('agent-snapshot-latest:ws_demo', {
      snapshotId: 'snap_ws_demo_later',
      scopeId: 'ws_demo',
      sourceSyncedAt: '2026-03-08T10:00:00.000Z',
    });
    mockStore.set('agent-snapshot:snap_ws_demo_later', {
      snapshotId: 'snap_ws_demo_later',
      scopeId: 'ws_demo',
      sourceSyncToken: 'sync-token',
      sourceSyncedAt: '2026-03-08T10:00:00.000Z',
      createdAt: '2026-03-08T10:05:00.000Z',
      expiresAt: Date.parse('2026-03-09T10:00:00.000Z'),
      posts: [{ id: 'p1', title: 'Post', subreddit: 'programming' }],
      filters: {},
    });
    mockStore.set('agent-config:ws_demo', {
      scopeId: 'ws_demo',
      workspaceId: 'ws_demo',
      version: 3,
      subreddits: ['programming'],
      filters: {},
      goals: 'Find leads',
      aiPrompt: '',
      opportunityConfig: {
        businessOffering: 'SEO consulting',
        idealCustomer: 'SaaS founders',
        problemsSolved: 'Search visibility',
        preferredEngagement: 'either',
        strategyPreset: 'balanced',
        opportunityTypes: ['lead'],
        strictness: 'balanced',
      },
      threshold: 4,
      model: 'openai/gpt-4o-mini',
      updatedAt: '2026-03-08T11:00:00.000Z',
    });
    mockStore.set('agent-analysis:snap_ws_demo_later', {
      snapshotId: 'snap_ws_demo_later',
      scopeId: 'ws_demo',
      status: 'completed',
      source: 'ai_job',
      jobId: 'job_123',
      opportunities: [{ postId: 'p1', hotScore: 5, matchReason: 'AI matched' }],
      opportunityCount: 1,
      totalPosts: 1,
      completedAt: '2026-03-08T11:30:00.000Z',
      modelUsed: 'openai/gpt-4o-mini',
      failedCount: 0,
    });

    const res = await runHandler(snapshotHandler, {
      method: 'GET',
      url: '/api/workspaces/ws_demo/snapshot',
      params: { workspaceId: 'ws_demo' },
      headers: {
        authorization: 'Bearer agent-test-key',
        origin: 'http://localhost:3000',
      },
    });

    expect(res.status).toBe(200);
    expect(res.body.data.analysis).toMatchObject({
      status: 'completed',
      source: 'ai_job',
      jobId: 'job_123',
      opportunityCount: 1,
      modelUsed: 'openai/gpt-4o-mini',
    });
  });

  test('serves workspace snapshot reads when derived persistence hits storage OOM', async () => {
    storage.set.mockImplementation(async (key, value) => {
      if (String(key).startsWith('agent-snapshot:') || String(key).startsWith('agent-analysis:')) {
        throw new Error("OOM command not allowed when used memory > 'maxmemory'.");
      }
      mockStore.set(key, value);
    });

    mockStore.set('agent-workspace:ws_demo', {
      workspaceId: 'ws_demo',
      sourceSyncToken: 'sync-token',
      createdAt: '2026-03-08T10:00:00.000Z',
      updatedAt: '2026-03-08T10:00:00.000Z',
    });
    mockStore.set('sync-token', {
      token: 'sync-token',
      posts: [
        {
          id: 'p1',
          title: 'Need SEO help',
          subreddit: 'seo',
          author: 'alice',
          score: 12,
          num_comments: 4,
          created_utc: Math.floor(Date.now() / 1000) - 1800,
          reddit_url: 'https://reddit.com/r/seo/comments/p1',
        },
      ],
      settings: {
        subreddits: ['seo'],
        aiGoals: 'Find SEO leads',
      },
      filters: {},
      syncedAt: '2026-03-08T10:00:00.000Z',
      timestamp: '2026-03-08T09:59:00.000Z',
      expiresAt: Date.parse('2026-03-09T10:00:00.000Z'),
    });

    const res = await runHandler(snapshotHandler, {
      method: 'GET',
      url: '/api/workspaces/ws_demo/snapshot',
      params: { workspaceId: 'ws_demo' },
      headers: {
        authorization: 'Bearer agent-test-key',
        origin: 'http://localhost:3000',
      },
    });

    expect(res.status).toBe(200);
    expect(res.body.data.snapshot).toMatchObject({
      workspaceId: 'ws_demo',
      sourceSyncToken: 'sync-token',
    });
    expect(res.body.data.posts).toEqual([
      expect.objectContaining({ id: 'p1', subreddit: 'seo' }),
    ]);
  });

  test('keeps workspace snapshot writes successful when only derived persistence hits storage OOM', async () => {
    storage.set.mockImplementation(async (key, value) => {
      if (String(key).startsWith('agent-snapshot:') || String(key).startsWith('agent-analysis:')) {
        throw new Error("OOM command not allowed when used memory > 'maxmemory'.");
      }
      mockStore.set(key, value);
    });

    const accessCookie = makeSignedCookie('access', 'access-token');
    mockStore.set('agent-workspace:ws_demo', {
      workspaceId: 'ws_demo',
      sourceSyncToken: 'sync-token',
      createdAt: '2026-03-08T10:00:00.000Z',
      updatedAt: '2026-03-08T10:00:00.000Z',
    });

    const res = await runHandler(snapshotHandler, {
      method: 'PUT',
      url: '/api/workspaces/ws_demo/snapshot',
      params: { workspaceId: 'ws_demo' },
      headers: {
        cookie: accessCookie.split(';')[0],
        origin: 'http://localhost:3000',
      },
      body: {
        token: 'sync-token',
        posts: [{ id: 'p2', title: 'Need help now', subreddit: 'seo' }],
        settings: {
          subreddits: ['seo'],
          aiGoals: 'Find urgent SEO leads',
        },
        filters: { minScore: 5 },
        timestamp: '2026-03-08T10:10:00.000Z',
      },
    });

    expect(res.status).toBe(200);
    expect(res.body.workspaceId).toBe('ws_demo');
    expect(mockStore.get('sync-token')).toMatchObject({
      token: 'sync-token',
      settings: { subreddits: ['seo'], aiGoals: 'Find urgent SEO leads' },
    });
  });
});
