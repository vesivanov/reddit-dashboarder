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
const snapshotHandler = require('../../../lib/api-v1/handlers/snapshot');

describe('/api/v1/snapshot', () => {
  beforeEach(() => {
    process.env.AGENT_API_KEY = 'agent-test-key';
    process.env.DIGEST_SYNC_TOKEN = 'sync-token';
    mockStore.clear();
  });

  test('materializes agent snapshot/config from sync storage', async () => {
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
          aiRelevance: 4,
        },
      ],
      settings: {
        subreddits: ['smallbusiness'],
        aiGoals: 'Find SEO leads',
        aiThreshold: 4,
        openRouterModel: 'openai/gpt-4o-mini',
      },
      filters: {
        minScore: 10,
      },
      syncedAt: '2026-03-08T10:00:00.000Z',
      timestamp: '2026-03-08T09:59:00.000Z',
      expiresAt: Date.parse('2026-03-09T10:00:00.000Z'),
    });

    const res = await runHandler(snapshotHandler, {
      method: 'GET',
      url: '/api/v1/snapshot?token=sync-token',
      headers: {
        authorization: 'Bearer agent-test-key',
        origin: 'http://localhost:3000',
      },
    });

    expect(res.status).toBe(200);
    expect(res.body.data.snapshot).toMatchObject({
      sourceSyncToken: 'sync-token',
      sourceSyncedAt: '2026-03-08T10:00:00.000Z',
    });
    expect(res.body.data.config).toMatchObject({
      subreddits: ['smallbusiness'],
      goals: 'Find SEO leads',
      aiContext: '',
      scoringConfig: null,
      threshold: 4,
      model: 'openai/gpt-4o-mini',
      version: 1,
    });
    expect(res.body.data.analysis).toMatchObject({
      status: 'heuristic_only',
      source: 'heuristic',
      totalPosts: 1,
    });

    const latestRefKey = Array.from(mockStore.keys()).find((key) => key.startsWith('agent-snapshot-latest:'));
    const latestRef = latestRefKey ? mockStore.get(latestRefKey) : null;
    expect(latestRef).toBeTruthy();
    const configKey = Array.from(mockStore.keys()).find((key) => key.startsWith('agent-config:'));
    expect(configKey).toBeUndefined();
  });

  test('returns persisted analysis state when available', async () => {
    mockStore.set('agent-snapshot-latest:scope_sync-token', {
      snapshotId: 'snap_sync-token_later',
      scopeId: 'scope_sync-token',
      sourceSyncedAt: '2026-03-08T10:00:00.000Z',
    });
    mockStore.set('agent-snapshot:snap_sync-token_later', {
      snapshotId: 'snap_sync-token_later',
      scopeId: 'scope_sync-token',
      sourceSyncToken: 'sync-token',
      sourceSyncedAt: '2026-03-08T10:00:00.000Z',
      createdAt: '2026-03-08T10:05:00.000Z',
      expiresAt: Date.parse('2026-03-09T10:00:00.000Z'),
      posts: [{ id: 'p1', title: 'Post', subreddit: 'programming' }],
      filters: {},
    });
    mockStore.set('agent-config:scope_sync-token', {
      scopeId: 'scope_sync-token',
      version: 3,
      subreddits: ['programming'],
      filters: {},
      goals: 'Find leads',
      aiPrompt: '',
      threshold: 4,
      model: 'openai/gpt-4o-mini',
      updatedAt: '2026-03-08T11:00:00.000Z',
    });
    mockStore.set('agent-analysis:snap_sync-token_later', {
      snapshotId: 'snap_sync-token_later',
      scopeId: 'scope_sync-token',
      status: 'completed',
      source: 'ai_job',
      jobId: 'job_123',
      hotLeads: [{ postId: 'p1', hotScore: 5, matchReason: 'AI matched' }],
      hotLeadCount: 1,
      totalPosts: 1,
      completedAt: '2026-03-08T11:30:00.000Z',
      modelUsed: 'openai/gpt-4o-mini',
      failedCount: 0,
    });

    const res = await runHandler(snapshotHandler, {
      method: 'GET',
      url: '/api/v1/snapshot?token=sync-token',
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
      hotLeadCount: 1,
      modelUsed: 'openai/gpt-4o-mini',
    });
  });
});
