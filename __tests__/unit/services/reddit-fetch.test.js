const { createTimeBudget } = require('../../../lib/services/reddit-fetch');

describe('reddit-fetch time budget', () => {
  const originalVercel = process.env.VERCEL;
  const originalApiRuntime = process.env.API_MAX_RUNTIME_MS;
  const originalVercelRuntime = process.env.VERCEL_TIMEOUT_MS;
  const originalBuffer = process.env.API_TIMEOUT_BUFFER_MS;

  afterEach(() => {
    if (originalVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = originalVercel;
    if (originalApiRuntime === undefined) delete process.env.API_MAX_RUNTIME_MS;
    else process.env.API_MAX_RUNTIME_MS = originalApiRuntime;
    if (originalVercelRuntime === undefined) delete process.env.VERCEL_TIMEOUT_MS;
    else process.env.VERCEL_TIMEOUT_MS = originalVercelRuntime;
    if (originalBuffer === undefined) delete process.env.API_TIMEOUT_BUFFER_MS;
    else process.env.API_TIMEOUT_BUFFER_MS = originalBuffer;
  });

  test('uses a 60s default runtime on Vercel when no override is configured', () => {
    process.env.VERCEL = '1';
    delete process.env.API_MAX_RUNTIME_MS;
    delete process.env.VERCEL_TIMEOUT_MS;
    process.env.API_TIMEOUT_BUFFER_MS = '3000';

    const budget = createTimeBudget(Date.now());
    expect(budget.budgetMs).toBe(57000);
  });
});
