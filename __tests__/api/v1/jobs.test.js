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

jest.mock('../../../lib/services/ai-ranking', () => ({
  buildBatches: jest.fn((posts) => [posts.map((post) => ({ id: String(post.id) }))]),
  callOpenRouter: jest.fn(async ({ postsBatch }) => ({
    scores: new Map(postsBatch.map((post) => [String(post.id), 4])),
    metadata: new Map(postsBatch.map((post) => [String(post.id), { confidence: 'high', reason: 'match' }])),
  })),
}));

const aiRanking = require('../../../lib/services/ai-ranking');
const { runHandler } = require('../../helpers/run-handler');
const jobsHandler = require('../../../lib/api-v1/handlers/jobs');

describe('/api/v1/analyze and /api/v1/jobs/:jobId', () => {
  beforeEach(() => {
    mockStore.clear();
    jest.clearAllMocks();
    process.env.AGENT_API_KEY = 'agent-test-key';
    process.env.OPENROUTER_API_KEY = 'server-openrouter-key';
  });

  test('POST queues a job pinned to snapshot/config and GET completes it', async () => {
    mockStore.set('sync-token', {
      token: 'sync-token',
      posts: [
        { id: 'p1', title: 'Need help', subreddit: 'programming' },
        { id: 'p2', title: 'Looking for consultant', subreddit: 'javascript' },
      ],
      settings: {
        subreddits: ['programming'],
        aiGoals: 'Find relevant posts',
        aiThreshold: 4,
        openRouterModel: 'openai/gpt-4o-mini',
      },
      filters: {},
      timestamp: '2026-03-08T10:00:00.000Z',
      syncedAt: '2026-03-08T10:00:00.000Z',
      expiresAt: Date.parse('2026-03-09T10:00:00.000Z'),
    });

    const postRes = await runHandler(jobsHandler, {
      method: 'POST',
      url: '/api/v1/analyze?token=sync-token',
      headers: {
        authorization: 'Bearer agent-test-key',
        origin: 'http://localhost:3000',
      },
    });

    expect(postRes.status).toBe(202);
    const jobId = postRes.body.data.job.id;
    expect(postRes.body.data.job).toMatchObject({
      status: 'queued',
      configVersion: 1,
    });

    const queuedRes = await runHandler(jobsHandler, {
      method: 'GET',
      url: `/api/v1/jobs/${jobId}`,
      headers: {
        authorization: 'Bearer agent-test-key',
        origin: 'http://localhost:3000',
      },
    });

    expect(queuedRes.status).toBe(200);
    expect(queuedRes.body.data.job.status).toBe('queued');

    const drainRes = await runHandler(jobsHandler, {
      method: 'POST',
      url: '/api/v1/jobs/drain',
      headers: {
        authorization: 'Bearer agent-test-key',
        origin: 'http://localhost:3000',
      },
    });

    expect(drainRes.status).toBe(200);
    expect(drainRes.body.data.processed).toBe(true);

    const getRes = await runHandler(jobsHandler, {
      method: 'GET',
      url: `/api/v1/jobs/${jobId}`,
      headers: {
        authorization: 'Bearer agent-test-key',
        origin: 'http://localhost:3000',
      },
    });

    expect(getRes.status).toBe(200);
    expect(getRes.body.data.job.status).toBe('completed');
    expect(getRes.body.data.job.result).toMatchObject({
      postsScored: 2,
      opportunityCount: 2,
      modelUsed: 'openai/gpt-4o-mini',
      failedCount: 0,
    });
    expect(aiRanking.callOpenRouter).toHaveBeenCalledTimes(1);

    const jobRecord = mockStore.get(`api-v1-job:${jobId}`);
    const analysisRecord = mockStore.get(`agent-analysis:${jobRecord.snapshotId}`);
    expect(analysisRecord).toMatchObject({
      status: 'completed',
      source: 'ai_job',
      jobId,
      opportunityCount: 2,
      threshold: 4,
    });

    const snapshotRecord = mockStore.get(`agent-snapshot:${jobRecord.snapshotId}`);
    expect(snapshotRecord.posts).toEqual([
      expect.objectContaining({
        id: 'p1',
        aiScoreProxy: 4,
        aiMetadata: { confidence: 'high', reason: 'match' },
      }),
      expect.objectContaining({
        id: 'p2',
        aiScoreProxy: 4,
        aiMetadata: { confidence: 'high', reason: 'match' },
      }),
    ]);
  });

  test('drain resumes a stale running job', async () => {
    mockStore.set('agent-snapshot:snap_sync-token_1', {
      snapshotId: 'snap_sync-token_1',
      scopeId: 'scope_sync-token',
      sourceSyncToken: 'sync-token',
      sourceSyncedAt: '2026-03-08T10:00:00.000Z',
      createdAt: '2026-03-08T10:00:00.000Z',
      expiresAt: Date.parse('2026-03-09T10:00:00.000Z'),
      posts: [{ id: 'p1', title: 'Post 1', subreddit: 'programming' }],
      filters: {},
    });
    mockStore.set('agent-config:scope_sync-token', {
      scopeId: 'scope_sync-token',
      version: 2,
      subreddits: ['programming'],
      filters: {},
      goals: 'Find relevant posts',
      aiPrompt: '',
      threshold: 4,
      model: 'openai/gpt-4o-mini',
      updatedAt: '2026-03-08T10:00:00.000Z',
    });
    mockStore.set('api-v1-job:job_stale', {
      id: 'job_stale',
      status: 'running',
      createdAt: Date.parse('2026-03-08T12:00:00.000Z'),
      startedAt: Date.parse('2026-03-08T12:00:30.000Z'),
      token: 'sync-token',
      scopeId: 'scope_sync-token',
      snapshotId: 'snap_sync-token_1',
      configVersion: 2,
      estimatedDurationSeconds: 30,
      leaseOwnerId: 'runner_old',
      leaseExpiresAt: Date.parse('2026-03-08T12:01:00.000Z'),
      progress: {
        postsScored: 0,
        totalPosts: 1,
        currentBatch: 0,
        totalBatches: 1,
      },
    });
    mockStore.set('api-v1-job-queue', ['job_stale']);
    mockStore.set('api-v1-job-index', ['job_stale']);

    const beforeDrain = await runHandler(jobsHandler, {
      method: 'GET',
      url: '/api/v1/jobs/job_stale',
      headers: {
        authorization: 'Bearer agent-test-key',
        origin: 'http://localhost:3000',
      },
    });

    expect(beforeDrain.status).toBe(200);
    expect(beforeDrain.body.data.job.status).toBe('running');

    const drainRes = await runHandler(jobsHandler, {
      method: 'POST',
      url: '/api/v1/jobs/drain',
      headers: {
        authorization: 'Bearer agent-test-key',
        origin: 'http://localhost:3000',
      },
    });

    expect(drainRes.status).toBe(200);
    expect(drainRes.body.data.processed).toBe(true);

    const res = await runHandler(jobsHandler, {
      method: 'GET',
      url: '/api/v1/jobs/job_stale',
      headers: {
        authorization: 'Bearer agent-test-key',
        origin: 'http://localhost:3000',
      },
    });

    expect(res.status).toBe(200);
    expect(res.body.data.job.status).toBe('completed');
    expect(aiRanking.callOpenRouter).toHaveBeenCalledTimes(1);
  });

  test('GET returns 404 for unknown job', async () => {
    const res = await runHandler(jobsHandler, {
      method: 'GET',
      url: '/api/v1/jobs/job_missing',
      headers: {
        authorization: 'Bearer agent-test-key',
        origin: 'http://localhost:3000',
      },
    });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
