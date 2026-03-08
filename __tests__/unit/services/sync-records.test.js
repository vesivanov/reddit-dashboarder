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

const storage = require('../../../lib/storage');
const {
  buildSyncRecord,
  refreshSyncRecord,
} = require('../../../lib/services/sync-records');

describe('sync-record service', () => {
  beforeEach(() => {
    mockStore.clear();
    jest.clearAllMocks();
  });

  test('buildSyncRecord normalizes defaults and ttl fields', () => {
    const now = Date.parse('2026-03-08T12:00:00.000Z');
    const record = buildSyncRecord({ token: 'abc', now });

    expect(record).toMatchObject({
      token: 'abc',
      posts: [],
      settings: {},
      filters: {},
      timestamp: '2026-03-08T12:00:00.000Z',
      syncedAt: '2026-03-08T12:00:00.000Z',
      expiresAt: Date.parse('2026-03-09T12:00:00.000Z'),
    });
  });

  test('refreshSyncRecord preserves passthrough metadata while renewing ttl', async () => {
    const now = Date.parse('2026-03-08T12:00:00.000Z');
    const refreshed = await refreshSyncRecord('sync-token', {
      token: 'sync-token',
      posts: [{ id: 'p1' }],
      settings: { aiGoals: 'test' },
      filters: { minScore: 10 },
      timestamp: '2026-03-08T10:00:00.000Z',
      syncedAt: '2026-03-08T10:00:00.000Z',
      expiresAt: Date.parse('2026-03-09T10:00:00.000Z'),
      lastAnalysisJobId: 'job_123',
      lastAnalyzedAt: '2026-03-08T11:00:00.000Z',
    }, { now });

    expect(refreshed).toEqual(expect.objectContaining({
      token: 'sync-token',
      lastAnalysisJobId: 'job_123',
      lastAnalyzedAt: '2026-03-08T11:00:00.000Z',
      syncedAt: '2026-03-08T12:00:00.000Z',
      expiresAt: Date.parse('2026-03-09T12:00:00.000Z'),
    }));
    expect(storage.set).toHaveBeenCalled();
  });
});
