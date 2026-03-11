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

process.env.SESSION_COOKIE_SECRET = 'test_secret_32_bytes_long_hex_string_123456';

const { runHandler } = require('../../helpers/run-handler');
const { makeSignedCookie } = require('../../../lib/cookies');
const handler = require('../../../lib/api-handlers/settings/opportunity-config');

describe('/api/settings/opportunity-config', () => {
  beforeEach(() => {
    mockStore.clear();
  });

  test('POST persists server-owned opportunity config for an authenticated session', async () => {
    mockStore.set('sync-token', {
      token: 'sync-token',
      settings: {
        subreddits: ['smallbusiness'],
      },
      filters: {},
      syncedAt: '2026-03-08T10:00:00.000Z',
      timestamp: '2026-03-08T09:59:00.000Z',
      expiresAt: Date.parse('2026-03-09T10:00:00.000Z'),
    });
    const accessCookie = makeSignedCookie('access', 'access-token');

    const res = await runHandler(handler, {
      method: 'POST',
      url: '/api/settings/opportunity-config',
      headers: {
        cookie: accessCookie.split(';')[0],
        origin: 'http://localhost:3000',
      },
      body: {
        token: 'sync-token',
        subreddits: ['smallbusiness'],
        goals: 'Find SEO opportunities',
        aiContext: 'Prioritize active threads',
        opportunityConfig: {
          businessOffering: 'SEO consulting',
          idealCustomer: 'Local business owners',
          problemsSolved: 'Traffic loss',
          preferredEngagement: 'reply',
          strategyPreset: 'sales',
          opportunityTypes: ['lead', 'pain_point'],
          strictness: 'balanced',
        },
        threshold: 4,
        model: 'openai/gpt-4o-mini',
      },
    });

    expect(res.status).toBe(200);
    expect(res.body.config.opportunityConfig).toMatchObject({
      businessOffering: 'SEO consulting',
      strategyPreset: 'sales',
      opportunityTypes: ['lead', 'pain_point'],
    });
    const activeWorkspace = mockStore.get('poller-active-workspace');
    expect(activeWorkspace?.workspaceId).toBeTruthy();
    const persistedConfigKey = Array.from(mockStore.keys()).find((key) => key.startsWith('agent-config:'));
    expect(mockStore.get(persistedConfigKey)).toMatchObject({
      goals: 'Find SEO opportunities',
      opportunityConfig: {
        businessOffering: 'SEO consulting',
        idealCustomer: 'Local business owners',
        problemsSolved: 'Traffic loss',
        preferredEngagement: 'reply',
        strategyPreset: 'sales',
        opportunityTypes: ['lead', 'pain_point'],
        strictness: 'balanced',
      },
    });
  });

  test('GET returns current persisted opportunity config', async () => {
    const accessCookie = makeSignedCookie('access', 'access-token');
    mockStore.set('agent-config:scope_sync-token', {
      scopeId: 'scope_sync-token',
      sourceSyncToken: 'sync-token',
      subreddits: ['smallbusiness'],
      goals: 'Find SEO opportunities',
      aiContext: 'Prioritize active threads',
      aiPrompt: '',
      opportunityConfig: {
        businessOffering: 'SEO consulting',
        idealCustomer: 'Local business owners',
        problemsSolved: 'Traffic loss',
        preferredEngagement: 'reply',
        strategyPreset: 'sales',
        opportunityTypes: ['lead'],
        strictness: 'strict',
      },
      threshold: 4,
      model: 'openai/gpt-4o-mini',
      version: 3,
      updatedAt: '2026-03-08T10:00:00.000Z',
    });

    const res = await runHandler(handler, {
      method: 'GET',
      url: '/api/settings/opportunity-config?token=sync-token',
      headers: {
        cookie: accessCookie.split(';')[0],
        origin: 'http://localhost:3000',
      },
    });

    expect(res.status).toBe(200);
    expect(res.body.config).toMatchObject({
      goals: 'Find SEO opportunities',
      opportunityConfig: {
        businessOffering: 'SEO consulting',
        strictness: 'strict',
      },
      version: 3,
    });
  });

  test('POST accepts larger subreddit lists for synced workspaces', async () => {
    const subreddits = Array.from({ length: 20 }, (_, index) => `subreddit${index + 1}`);
    mockStore.set('sync-token', {
      token: 'sync-token',
      settings: { subreddits },
      filters: {},
      syncedAt: '2026-03-08T10:00:00.000Z',
      timestamp: '2026-03-08T09:59:00.000Z',
      expiresAt: Date.parse('2026-03-09T10:00:00.000Z'),
    });
    const accessCookie = makeSignedCookie('access', 'access-token');

    const res = await runHandler(handler, {
      method: 'POST',
      url: '/api/settings/opportunity-config',
      headers: {
        cookie: accessCookie.split(';')[0],
        origin: 'http://localhost:3000',
      },
      body: {
        token: 'sync-token',
        subreddits,
        goals: 'Find opportunities across a larger watchlist',
      },
    });

    expect(res.status).toBe(200);
    expect(res.body.config.subreddits).toHaveLength(20);
  });

  test('POST normalizes mixed-case subreddit names before validation', async () => {
    mockStore.set('sync-token', {
      token: 'sync-token',
      settings: { subreddits: ['SmallBusiness'] },
      filters: {},
      syncedAt: '2026-03-08T10:00:00.000Z',
      timestamp: '2026-03-08T09:59:00.000Z',
      expiresAt: Date.parse('2026-03-09T10:00:00.000Z'),
    });
    const accessCookie = makeSignedCookie('access', 'access-token');

    const res = await runHandler(handler, {
      method: 'POST',
      url: '/api/settings/opportunity-config',
      headers: {
        cookie: accessCookie.split(';')[0],
        origin: 'http://localhost:3000',
      },
      body: {
        token: 'sync-token',
        subreddits: ['R/SmallBusiness', 'SEO'],
        goals: 'Normalize names before save',
      },
    });

    expect(res.status).toBe(200);
    expect(res.body.config.subreddits).toEqual(['smallbusiness', 'seo']);
  });
});
