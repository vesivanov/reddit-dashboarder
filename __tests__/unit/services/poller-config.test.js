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

const { loadPollerRuntimeConfig } = require('../../../lib/services/poller-config');

describe('poller-config service', () => {
  beforeEach(() => {
    mockStore.clear();
    delete process.env.POLLER_OPENROUTER_MODEL;
  });

  test('uses active workspace config as the canonical poller source', async () => {
    mockStore.set('poller-active-workspace', {
      workspaceId: 'ws_123',
      updatedAt: '2026-03-08T12:00:00.000Z',
    });
    mockStore.set('agent-config:ws_123', {
      scopeId: 'ws_123',
      subreddits: ['persistedsub'],
      goals: 'Persisted goals',
      aiContext: 'Persisted context',
      threshold: 5,
      model: 'persisted/model',
      scoringConfig: { lookingFor: 'Persisted goals', avoid: 'Students' },
    });

    const result = await loadPollerRuntimeConfig();

    expect(result.source).toBe('agent-config');
    expect(result.activeWorkspace).toEqual({
      workspaceId: 'ws_123',
      updatedAt: '2026-03-08T12:00:00.000Z',
    });
    expect(result.subreddits).toEqual(['persistedsub']);
    expect(result.settings).toEqual({
      aiGoals: 'Persisted goals',
      aiContext: 'Persisted context',
      aiThreshold: 5,
      openRouterModel: 'persisted/model',
      scoringConfig: { lookingFor: 'Persisted goals', avoid: 'Students' },
    });
  });

  test('falls back to env-backed defaults when no config exists', async () => {
    process.env.POLLER_OPENROUTER_MODEL = 'env/model';

    const result = await loadPollerRuntimeConfig();

    expect(result.source).toBe('defaults');
    expect(result.subreddits).toEqual(['SEO', 'webdev', 'startups', 'freelance', 'marketing']);
    expect(result.settings.openRouterModel).toBe('env/model');
  });
});
