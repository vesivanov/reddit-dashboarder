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

process.env.SESSION_COOKIE_SECRET = 'test_secret_32_bytes_long_hex_string_123456';

const { makeSignedCookie } = require('../../../lib/cookies');
const { runHandler } = require('../../helpers/run-handler');
const workspacesHandler = require('../../../lib/api-handlers/workspaces');

describe('/api/workspaces', () => {
  beforeEach(() => {
    mockStore.clear();
  });

  test('POST bootstraps a canonical workspace for an authenticated session', async () => {
    const accessCookie = makeSignedCookie('access', 'access-token');

    const res = await runHandler(workspacesHandler, {
      method: 'POST',
      url: '/api/workspaces',
      headers: {
        cookie: accessCookie.split(';')[0],
        origin: 'http://localhost:3000',
      },
      body: {
        token: 'sync-token',
      },
    });

    expect(res.status).toBe(200);
    expect(res.body.workspaceId).toBeTruthy();
    expect(mockStore.get('agent-workspace-token:sync-token')).toMatchObject({
      workspaceId: res.body.workspaceId,
    });
  });
});
