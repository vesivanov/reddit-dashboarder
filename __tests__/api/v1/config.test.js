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

const { makeSignedCookie } = require('../../../lib/cookies');
const { runHandler } = require('../../helpers/run-handler');
const configHandler = require('../../../lib/api-v1/handlers/config');

describe('workspace config handler', () => {
  beforeEach(() => {
    process.env.AGENT_API_KEY = 'agent-test-key';
    process.env.DIGEST_SYNC_TOKEN = 'sync-token';
    process.env.SESSION_COOKIE_SECRET = 'test_secret_32_bytes_long_hex_string_123456';
    mockStore.clear();
  });

  test('GET supports workspace-scoped config reads', async () => {
    mockStore.set('agent-workspace:ws_demo', {
      workspaceId: 'ws_demo',
      sourceSyncToken: 'sync-token',
      createdAt: '2026-03-08T10:00:00.000Z',
      updatedAt: '2026-03-08T10:00:00.000Z',
    });
    mockStore.set('agent-config:ws_demo', {
      scopeId: 'ws_demo',
      workspaceId: 'ws_demo',
      sourceSyncToken: 'sync-token',
      subreddits: ['programming'],
      filters: {},
      goals: 'Watch programming',
      aiPrompt: '',
      threshold: 3,
      model: 'openai/gpt-4o-mini',
      updatedAt: '2026-03-08T10:00:00.000Z',
      version: 2,
    });

    const res = await runHandler(configHandler, {
      method: 'GET',
      url: '/api/workspaces/ws_demo/config',
      params: { workspaceId: 'ws_demo' },
      headers: {
        authorization: 'Bearer agent-test-key',
        origin: 'http://localhost:3000',
      },
    });

    expect(res.status).toBe(200);
    expect(res.body.data.config).toMatchObject({
      subreddits: ['programming'],
      version: 2,
    });
    expect(res.headers.etag).toBe('2');
  });

  test('workspace routes accept authenticated browser sessions', async () => {
    const accessCookie = makeSignedCookie('access', 'access-token');
    mockStore.set('agent-workspace:ws_demo', {
      workspaceId: 'ws_demo',
      sourceSyncToken: 'sync-token',
      createdAt: '2026-03-08T10:00:00.000Z',
      updatedAt: '2026-03-08T10:00:00.000Z',
    });
    mockStore.set('agent-config:ws_demo', {
      scopeId: 'ws_demo',
      workspaceId: 'ws_demo',
      sourceSyncToken: 'sync-token',
      subreddits: ['seo'],
      filters: { minScore: 5 },
      goals: 'Find leads',
      aiContext: '',
      aiPrompt: '',
      threshold: 3,
      model: 'openai/gpt-4o-mini',
      updatedAt: '2026-03-08T10:00:00.000Z',
      version: 1,
    });

    const getRes = await runHandler(configHandler, {
      method: 'GET',
      url: '/api/workspaces/ws_demo/config',
      params: { workspaceId: 'ws_demo' },
      headers: {
        cookie: accessCookie.split(';')[0],
        origin: 'http://localhost:3000',
      },
    });

    expect(getRes.status).toBe(200);
    expect(getRes.body.data.config).toMatchObject({
      workspaceId: 'ws_demo',
      subreddits: ['seo'],
    });

    const patchRes = await runHandler(configHandler, {
      method: 'PATCH',
      url: '/api/workspaces/ws_demo/config',
      params: { workspaceId: 'ws_demo' },
      headers: {
        cookie: accessCookie.split(';')[0],
        origin: 'http://localhost:3000',
        'if-match': '1',
      },
      body: {
        goals: 'Find urgent SEO leads',
      },
    });

    expect(patchRes.status).toBe(200);
    expect(mockStore.get('agent-config:ws_demo')).toMatchObject({
      goals: 'Find urgent SEO leads',
      version: 2,
    });
  });

  test('GET derives config from sync storage for a workspace route', async () => {
    mockStore.set('agent-workspace:ws_demo', {
      workspaceId: 'ws_demo',
      sourceSyncToken: 'sync-token',
      createdAt: '2026-03-08T10:00:00.000Z',
      updatedAt: '2026-03-08T10:00:00.000Z',
    });
    mockStore.set('sync-token', {
      settings: {
        subreddits: ['programming', 'javascript'],
        aiGoals: 'Find React discussions',
        aiPrompt: 'Prompt',
        aiThreshold: 4,
        openRouterModel: 'openai/gpt-4o-mini',
        opportunityConfig: {
          businessOffering: 'Fractional growth strategy',
          idealCustomer: 'Developer tool founders',
          problemsSolved: 'Positioning and acquisition',
          preferredEngagement: 'reply',
          strategyPreset: 'balanced',
          opportunityTypes: ['lead', 'pain_point'],
          strictness: 'balanced',
        },
      },
      filters: { minScore: 10 },
      syncedAt: '2026-03-08T10:00:00.000Z',
      timestamp: '2026-03-08T09:59:00.000Z',
      expiresAt: Date.parse('2026-03-09T10:00:00.000Z'),
    });

    const res = await runHandler(configHandler, {
      method: 'GET',
      url: '/api/workspaces/ws_demo/config',
      params: { workspaceId: 'ws_demo' },
      headers: {
        authorization: 'Bearer agent-test-key',
        origin: 'http://localhost:3000',
      },
    });

    expect(res.status).toBe(200);
    expect(res.body.data.config).toEqual({
      workspaceId: 'ws_demo',
      subreddits: ['programming', 'javascript'],
      filters: { minScore: 10 },
      goals: 'Find React discussions',
      aiContext: '',
      aiPrompt: 'Prompt',
      opportunityConfig: {
        businessOffering: 'Fractional growth strategy',
        idealCustomer: 'Developer tool founders',
        problemsSolved: 'Positioning and acquisition',
        preferredEngagement: 'reply',
        strategyPreset: 'balanced',
        opportunityTypes: ['lead', 'pain_point'],
        strictness: 'balanced',
      },
      scoringConfig: null,
      threshold: 4,
      model: 'openai/gpt-4o-mini',
      version: 1,
      updatedAt: expect.any(String),
    });
    expect(res.headers.etag).toBe('1');
  });

  test('PATCH updates workspace config with versioning and audit log', async () => {
    mockStore.set('agent-workspace:ws_demo', {
      workspaceId: 'ws_demo',
      sourceSyncToken: 'sync-token',
      createdAt: '2026-03-08T10:00:00.000Z',
      updatedAt: '2026-03-08T10:00:00.000Z',
    });
    mockStore.set('agent-config:ws_demo', {
      scopeId: 'ws_demo',
      workspaceId: 'ws_demo',
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
      url: '/api/workspaces/ws_demo/config',
      params: { workspaceId: 'ws_demo' },
      headers: {
        authorization: 'Bearer agent-test-key',
        origin: 'http://localhost:3000',
        'if-match': '1',
      },
      body: {
        goals: 'New goals',
        aiContext: 'Prioritize urgent buying intent',
        opportunityConfig: {
          businessOffering: 'SEO consulting',
          idealCustomer: 'SMB owners',
          problemsSolved: 'Traffic loss and ranking drops',
          preferredEngagement: 'reply',
          strategyPreset: 'sales',
          opportunityTypes: ['lead', 'pain_point', 'tool_search'],
          strictness: 'strict',
        },
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
    expect(mockStore.get('agent-config:ws_demo')).toMatchObject({
      goals: 'New goals',
      aiContext: 'Prioritize urgent buying intent',
      opportunityConfig: {
        businessOffering: 'SEO consulting',
        idealCustomer: 'SMB owners',
        problemsSolved: 'Traffic loss and ranking drops',
        preferredEngagement: 'reply',
        strategyPreset: 'sales',
        opportunityTypes: ['lead', 'pain_point', 'tool_search'],
        strictness: 'strict',
      },
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
    expect(res.body.data.auditLog).toMatchObject({
      action: 'CONFIG_UPDATE',
      changedFields: ['goals', 'aiContext', 'opportunityConfig', 'scoringConfig', 'threshold', 'model'],
      previous: {
        goals: 'Old goals',
        aiContext: undefined,
        opportunityConfig: null,
        scoringConfig: null,
        threshold: 3,
        model: 'old-model',
      },
      version: 2,
    });
    expect(res.headers.etag).toBe('2');
  });

  test('PATCH rejects stale workspace config versions', async () => {
    mockStore.set('agent-workspace:ws_demo', {
      workspaceId: 'ws_demo',
      sourceSyncToken: 'sync-token',
      createdAt: '2026-03-08T10:00:00.000Z',
      updatedAt: '2026-03-08T10:00:00.000Z',
    });
    mockStore.set('agent-config:ws_demo', {
      scopeId: 'ws_demo',
      workspaceId: 'ws_demo',
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
      url: '/api/workspaces/ws_demo/config',
      params: { workspaceId: 'ws_demo' },
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

  test('PATCH rejects workspace CAS conflicts after the initial version check', async () => {
    mockStore.set('agent-workspace:ws_demo', {
      workspaceId: 'ws_demo',
      sourceSyncToken: 'sync-token',
      createdAt: '2026-03-08T10:00:00.000Z',
      updatedAt: '2026-03-08T10:00:00.000Z',
    });
    mockStore.set('agent-config:ws_demo', {
      scopeId: 'ws_demo',
      workspaceId: 'ws_demo',
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
        scopeId: 'ws_demo',
        version: 5,
      },
    }));

    const res = await runHandler(configHandler, {
      method: 'PATCH',
      url: '/api/workspaces/ws_demo/config',
      params: { workspaceId: 'ws_demo' },
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
