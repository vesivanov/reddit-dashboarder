const { describe, test, expect } = require('@jest/globals');

const refreshLeadsHandler = require('../../../api/cron/refresh-opportunities');
const { runHandler } = require('../../helpers/run-handler');

describe('/api/cron/refresh-opportunities', () => {
  test('returns 503 because the poller is temporarily disabled', async () => {
    const res = await runHandler(refreshLeadsHandler, {
      method: 'GET',
      url: '/api/cron/refresh-opportunities',
      headers: {
        origin: 'http://localhost:3000',
        'x-cron-secret': 'cron-secret',
      },
    });

    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      error: 'Poller disabled',
      message: 'The Reddit opportunities poller is temporarily disabled.',
    });
  });
});
