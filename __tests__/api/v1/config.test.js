const { describe, test, expect, beforeEach } = require('@jest/globals');

const mockStore = new Map();

jest.mock('../../../lib/storage', () => ({
  get: jest.fn(async (key) => mockStore.get(key) ?? null),
  set: jest.fn(async (key, value) => {
    mockStore.set(key, value);
  }),
  compareAndSwap: jest.fn(async (key, expectedValue, nextValue) => {
    const current = mockStore.get(key) ?? null;
    if (JSON.stringify(current) !== JSON.stringify(expectedValue)) {
      return { ok: false, current };
    }
    mockStore.set(key, nextValue);
    return { ok: true, current };
  }),
  delete: jest.fn(async (key) => {
    mockStore.delete(key);
  }),
}));

const { runHandler } = require('../../helpers/run-handler');
const configHandler = require('../../../lib/api-v1/handlers/config');

describe('/api/v1/config', () => {
  beforeEach(() => {
    process.env.AGENT_API_KEY = 'agent-test-key';
    process.env.DIGEST_SYNC_TOKEN = 'sync-token';
    mockStore.clear();
  });

  test('GET materializes normalized config from sync storage', async () => {
    mockStore.set('sync-token', {
      settings: {
        subreddits: ['programming', 'javascript'],
        aiGoals: 'Find React discussions',
        aiPrompt: 'Prompt',
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

    const res = await runHandler(configHandler, {
      method: 'GET',
      url: '/api/v1/config?token=sync-token',
      headers: {
        authorization: 'Bearer agent-test-key',
        origin: 'http://localhost:3000',
      },
    });

    expect(res.status).toBe(200);
    expect(res.body.data.config).toEqual({
      subreddits: ['programming', 'javascript'],
      filters: { minScore: 10 },
      goals: 'Find React discussions',
      aiContext: '',
      aiPrompt: 'Prompt',
      scoringConfig: null,
      threshold: 4,
      model: 'openai/gpt-4o-mini',
      version: 1,
      updatedAt: expect.any(String),
    });
    expect(res.headers.etag).toBe('1');
    const workspaceRefKey = Array.from(mockStore.keys()).find((key) => key.startsWith('agent-workspace-token:'));
    expect(workspaceRefKey).toBeTruthy();
    const configKey = Array.from(mockStore.keys()).find((key) => key.startsWith('agent-config:'));
    expect(configKey).toBeUndefined();
  });

  test('PATCH updates only agent config with versioning', async () => {
    mockStore.set('agent-config:scope_sync-token', {
      scopeId: 'scope_sync-token',
      sourceSyncToken: 'sync-token',
      subreddits: ['programming'],
      filters: { minScore: 5 },
      goals: 'Old goals',
      aiPrompt: '',
      threshold: 3,
      model: 'old-model',
      createdAt: '2026-03-08T10:00:00.000Z',
      updatedAt: '2026-03-08T10:00:00.000Z',
      version: 1,
    });

    const res = await runHandler(configHandler, {
      method: 'PATCH',
      url: '/api/v1/config?token=sync-token',
      headers: {
        authorization: 'Bearer agent-test-key',
        origin: 'http://localhost:3000',
        'if-match': '1',
      },
      body: {
        goals: 'New goals',
        aiContext: 'Prioritize urgent buying intent',
        scoringConfig: {
          lookingFor: 'New goals',
          avoid: 'Students',
          examples: {
            perfect: 'Founder needs help now',
          },
        },
        threshold: 5,
        model: 'openai/gpt-4o-mini',
      },
    });

    expect(res.status).toBe(200);
    expect(mockStore.get('agent-config:scope_sync-token')).toMatchObject({
      goals: 'New goals',
      aiContext: 'Prioritize urgent buying intent',
      scoringConfig: {
        lookingFor: 'New goals',
        avoid: 'Students',
        examples: {
          perfect: 'Founder needs help now',
          strong: '',
          reject: '',
        },
      },
      threshold: 5,
      model: 'openai/gpt-4o-mini',
      version: 2,
    });
    expect(mockStore.get('poller-active-workspace')).toMatchObject({
      workspaceId: 'scope_sync-token',
    });
    expect(res.body.data.auditLog).toMatchObject({
      action: 'CONFIG_UPDATE',
      changedFields: ['goals', 'aiContext', 'scoringConfig', 'threshold', 'model'],
      previous: {
        goals: 'Old goals',
        aiContext: undefined,
        scoringConfig: null,
        threshold: 3,
        model: 'old-model',
      },
      version: 2,
    });
    expect(res.headers.etag).toBe('2');
  });

  test('PATCH rejects stale config versions', async () => {
    mockStore.set('agent-config:scope_sync-token', {
      scopeId: 'scope_sync-token',
      sourceSyncToken: 'sync-token',
      subreddits: ['programming'],
      filters: {},
      goals: 'Current goals',
      aiPrompt: '',
      threshold: 3,
      model: 'openai/gpt-4o-mini',
      createdAt: '2026-03-08T10:00:00.000Z',
      updatedAt: '2026-03-08T10:00:00.000Z',
      version: 4,
    });

    const res = await runHandler(configHandler, {
      method: 'PATCH',
      url: '/api/v1/config?token=sync-token',
      headers: {
        authorization: 'Bearer agent-test-key',
        origin: 'http://localhost:3000',
        'if-match': '3',
      },
      body: {
        goals: 'Race lost',
      },
    });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('VERSION_CONFLICT');
  });

  test('PATCH rejects storage-level CAS conflicts even when request version matched initial read', async () => {
    mockStore.set('agent-config:scope_sync-token', {
      scopeId: 'scope_sync-token',
      sourceSyncToken: 'sync-token',
      subreddits: ['programming'],
      filters: {},
      goals: 'Current goals',
      aiPrompt: '',
      threshold: 3,
      model: 'openai/gpt-4o-mini',
      createdAt: '2026-03-08T10:00:00.000Z',
      updatedAt: '2026-03-08T10:00:00.000Z',
      version: 4,
    });

    const storage = require('../../../lib/storage');
    storage.compareAndSwap.mockImplementationOnce(async (_key, _expectedValue, _nextValue) => ({
      ok: false,
      current: {
        scopeId: 'scope_sync-token',
        version: 5,
      },
    }));

    const res = await runHandler(configHandler, {
      method: 'PATCH',
      url: '/api/v1/config?token=sync-token',
      headers: {
        authorization: 'Bearer agent-test-key',
        origin: 'http://localhost:3000',
        'if-match': '4',
      },
      body: {
        goals: 'Lost race anyway',
      },
    });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('VERSION_CONFLICT');
    expect(res.body.error.details).toEqual([
      { field: 'version', message: 'Current stored version is 5' },
    ]);
  });
});
