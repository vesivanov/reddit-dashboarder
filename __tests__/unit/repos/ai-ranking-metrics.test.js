const mockStore = new Map();

jest.mock('../../../lib/storage', () => ({
  get: jest.fn(async (key) => mockStore.get(key) ?? null),
  set: jest.fn(async (key, value) => {
    mockStore.set(key, value);
  }),
  compareAndSwap: jest.fn(async (key, expectedValue, nextValue) => {
    const current = mockStore.get(key) ?? null;
    const expectedSerialized = expectedValue === undefined ? undefined : JSON.stringify(expectedValue);
    const currentSerialized = current === null ? JSON.stringify(null) : JSON.stringify(current);
    if (expectedSerialized !== undefined && expectedSerialized !== currentSerialized) {
      return { ok: false, current };
    }
    mockStore.set(key, nextValue);
    return { ok: true, current };
  }),
}));

const {
  AI_RANKING_METRICS_KEY,
  recordAiRankingMetric,
  getAiRankingMetrics,
} = require('../../../lib/repos/ai-ranking-metrics');

describe('ai ranking metrics repo', () => {
  beforeEach(() => {
    mockStore.clear();
    delete process.env.AI_RANKING_METRICS_MAX_RECENT;
  });

  test('records rolling AI ranking metrics and aggregates per model', async () => {
    await recordAiRankingMetric({
      id: 'metric_1',
      status: 'success',
      requestedModel: 'openai/gpt-4o-mini',
      resolvedModel: 'openai/gpt-4o-mini',
      modelsUsed: ['openai/gpt-4o-mini'],
      postCount: 24,
      processedCount: 24,
      failedCount: 0,
      batchCount: 2,
      successfulBatchCount: 2,
      failedBatchCount: 0,
      durationMs: 1200,
      concurrency: 2,
    });
    await recordAiRankingMetric({
      id: 'metric_2',
      status: 'partial',
      requestedModel: 'openai/gpt-4o-mini',
      resolvedModel: 'openai/gpt-4o-mini',
      modelsUsed: ['openai/gpt-4o-mini'],
      postCount: 30,
      processedCount: 30,
      failedCount: 6,
      batchCount: 3,
      successfulBatchCount: 2,
      failedBatchCount: 1,
      durationMs: 1800,
      concurrency: 2,
      fallbackUsed: false,
    });

    const store = await getAiRankingMetrics();

    expect(mockStore.has(AI_RANKING_METRICS_KEY)).toBe(true);
    expect(store.summary).toMatchObject({
      totalRequests: 2,
      successCount: 1,
      partialCount: 1,
      errorCount: 0,
      totalPosts: 54,
      totalProcessedPosts: 54,
      totalFailedPosts: 6,
      totalBatches: 5,
      successfulBatches: 4,
      failedBatches: 1,
    });
    expect(store.summary.byRequestedModel['openai/gpt-4o-mini']).toMatchObject({
      requests: 2,
      successCount: 1,
      partialCount: 1,
      totalPosts: 54,
      totalFailedPosts: 6,
    });
    expect(store.recent.map((entry) => entry.id)).toEqual(['metric_2', 'metric_1']);
  });

  test('keeps only the configured recent metric window', async () => {
    process.env.AI_RANKING_METRICS_MAX_RECENT = '2';

    await recordAiRankingMetric({ id: 'metric_a', requestedModel: 'm1', durationMs: 1 });
    await recordAiRankingMetric({ id: 'metric_b', requestedModel: 'm1', durationMs: 1 });
    await recordAiRankingMetric({ id: 'metric_c', requestedModel: 'm1', durationMs: 1 });

    const store = await getAiRankingMetrics();
    expect(store.recent.map((entry) => entry.id)).toEqual(['metric_c', 'metric_b']);
  });
});
