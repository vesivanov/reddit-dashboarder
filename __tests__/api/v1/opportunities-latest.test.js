const { describe, test, expect, beforeEach } = require('@jest/globals');

jest.mock('../../../lib/storage', () => ({
  get: jest.fn(),
}));

const storage = require('../../../lib/storage');
const { runHandler } = require('../../helpers/run-handler');
const opportunitiesLatestHandler = require('../../../api/v1/opportunities/latest');

describe('/api/v1/opportunities/latest', () => {
  beforeEach(() => {
    process.env.AGENT_API_KEY = 'agent-test-key';
    storage.get.mockReset();
  });

  test('returns the canonical opportunity payload', async () => {
    storage.get
      .mockResolvedValueOnce({
        polledAt: '2026-03-08T10:30:00.000Z',
        opportunityCount: 2,
        opportunities: [{ id: 'opp-1' }, { id: 'opp-2' }],
        subreddits: ['seo'],
        postCount: 12,
      });

    const res = await runHandler(opportunitiesLatestHandler, {
      method: 'GET',
      url: '/api/v1/opportunities/latest',
      headers: {
        authorization: 'Bearer agent-test-key',
      },
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.opportunityCount).toBe(2);
    expect(res.body.opportunities).toEqual([{ id: 'opp-1' }, { id: 'opp-2' }]);
    expect(storage.get).toHaveBeenCalledWith('latest-opportunities');
  });
});
