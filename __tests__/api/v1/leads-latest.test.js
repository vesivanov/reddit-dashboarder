const { describe, test, expect, beforeEach } = require('@jest/globals');

jest.mock('../../../lib/storage', () => ({
  get: jest.fn(),
  set: jest.fn(),
  delete: jest.fn(),
}));

const storage = require('../../../lib/storage');
const { runHandler } = require('../../helpers/run-handler');
const leadsLatestHandler = require('../../../api/v1/leads/latest');

describe('/api/v1/leads/latest', () => {
  beforeEach(() => {
    process.env.AGENT_API_KEY = 'agent-test-key';
    storage.get.mockReset();
  });

  test('requires bearer auth', async () => {
    const res = await runHandler(leadsLatestHandler, {
      method: 'GET',
      url: '/api/v1/leads/latest',
      headers: {
        origin: 'http://localhost:3000',
      },
    });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      error: 'Unauthorized',
      message: 'Missing Authorization header',
    });
  });

  test('returns 404 when no leads have been stored yet', async () => {
    storage.get.mockResolvedValue(null);

    const res = await runHandler(leadsLatestHandler, {
      method: 'GET',
      url: '/api/v1/leads/latest',
      headers: {
        authorization: 'Bearer agent-test-key',
        origin: 'http://localhost:3000',
      },
    });

    expect(res.status).toBe(404);
    expect(storage.get).toHaveBeenCalledWith('latest-leads');
    expect(res.body).toEqual({
      error: 'No leads data',
      message: 'No poll data found. The cron job may not have run yet.',
      polledAt: null,
      hotLeadCount: 0,
      hotLeads: [],
    });
  });

  test('returns lead data with freshness metadata', async () => {
    const originalNow = Date.now;
    Date.now = jest.fn(() => Date.parse('2026-03-08T12:00:00.000Z'));

    try {
      storage.get.mockResolvedValue({
        polledAt: '2026-03-08T10:30:00.000Z',
        hotLeadCount: 2,
        hotLeads: [{ id: 'lead-1' }, { id: 'lead-2' }],
        subreddits: ['seo', 'webdev'],
        postCount: 18,
      });

      const res = await runHandler(leadsLatestHandler, {
        method: 'GET',
        url: '/api/v1/leads/latest',
        headers: {
          authorization: 'Bearer agent-test-key',
        },
      });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        polledAt: '2026-03-08T10:30:00.000Z',
        ageMinutes: 90,
        isFresh: true,
        hotLeadCount: 2,
        hotLeads: [{ id: 'lead-1' }, { id: 'lead-2' }],
        subreddits: ['seo', 'webdev'],
        totalPosts: 18,
      });
    } finally {
      Date.now = originalNow;
    }
  });

  test('returns 500 when storage access fails', async () => {
    storage.get.mockRejectedValue(new Error('storage unavailable'));

    const res = await runHandler(leadsLatestHandler, {
      method: 'GET',
      url: '/api/v1/leads/latest',
      headers: {
        authorization: 'Bearer agent-test-key',
      },
    });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: 'Failed to fetch leads',
      message: 'storage unavailable',
    });
  });
});
