const { beforeEach, describe, expect, test } = require('@jest/globals');

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

jest.mock('../../../lib/services/analysis-jobs', () => ({
  runAnalysisJob: jest.fn(async () => {}),
}));

const storage = require('../../../lib/storage');
const { enqueueJob, getJob, saveJob } = require('../../../lib/api-v1/job-store');
const { runAnalysisJob } = require('../../../lib/services/analysis-jobs');
const {
  processNextJob,
  requeueRecoverableJobs,
  resetJobQueueWorkerForTests,
} = require('../../../lib/services/analysis-job-queue');

describe('analysis job queue', () => {
  beforeEach(() => {
    mockStore.clear();
    jest.clearAllMocks();
    resetJobQueueWorkerForTests();
  });

  test('processes queued jobs from persistent storage', async () => {
    mockStore.set('agent-snapshot:snap_1', {
      snapshotId: 'snap_1',
      scopeId: 'scope_sync-token',
      posts: [{ id: 'p1' }],
      expiresAt: Date.parse('2026-03-09T12:00:00.000Z'),
    });

    await saveJob('job_1', {
      id: 'job_1',
      status: 'queued',
      token: 'sync-token',
      scopeId: 'scope_sync-token',
      snapshotId: 'snap_1',
      createdAt: Date.parse('2026-03-08T12:00:00.000Z'),
    });
    await enqueueJob('job_1');

    await processNextJob(Date.parse('2026-03-08T12:00:00.000Z'));

    expect(runAnalysisJob).toHaveBeenCalledWith('job_1');
  });

  test('requeues stale running jobs for recovery', async () => {
    await saveJob('job_stale', {
      id: 'job_stale',
      status: 'running',
      token: 'sync-token',
      createdAt: Date.parse('2026-03-08T12:00:00.000Z'),
      startedAt: Date.parse('2026-03-08T12:00:00.000Z'),
      leaseExpiresAt: Date.parse('2026-03-08T12:01:00.000Z'),
    });

    const now = Date.parse('2026-03-08T12:10:00.000Z');
    await requeueRecoverableJobs(now);

    await expect(getJob('job_stale')).resolves.toEqual(expect.objectContaining({
      status: 'queued',
      recoveredAt: now,
      leaseExpiresAt: null,
    }));
    await expect(storage.get('api-v1-job-queue')).resolves.toContain('job_stale');
  });
});
