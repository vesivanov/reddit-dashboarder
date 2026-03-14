jest.mock('../../../lib/storage', () => ({
  get: jest.fn(),
  set: jest.fn(),
  compareAndSwap: jest.fn(),
}));

const storage = require('../../../lib/storage');
const {
  AI_RANKING_AUDIT_INDEX_KEY,
  buildAiRankingAuditMetaKey,
  buildAiRankingAuditChunkKey,
  saveAiRankingAudit,
  listAiRankingAudits,
  getAiRankingAudit,
} = require('../../../lib/repos/ai-ranking-audits');

describe('ai ranking audits repo', () => {
  const mockStore = new Map();

  beforeEach(() => {
    mockStore.clear();
    storage.get.mockReset();
    storage.set.mockReset();
    storage.compareAndSwap.mockReset();

    storage.get.mockImplementation(async (key) => (
      mockStore.has(key) ? mockStore.get(key) : null
    ));
    storage.set.mockImplementation(async (key, value) => {
      mockStore.set(key, value);
    });
    storage.compareAndSwap.mockImplementation(async (key, expectedValue, nextValue) => {
      const current = mockStore.has(key) ? mockStore.get(key) : null;
      if (JSON.stringify(current) !== JSON.stringify(expectedValue ?? null)) {
        return { ok: false, current };
      }
      mockStore.set(key, nextValue);
      return { ok: true, current };
    });
  });

  test('saves full ranking audits in chunks and reassembles them', async () => {
    const entries = Array.from({ length: 3 }, (_value, index) => ({
      postId: `p${index + 1}`,
      post: {
        id: `p${index + 1}`,
        title: `Post ${index + 1}`,
        selftext: `Body ${index + 1}`,
        subreddit: 'test',
      },
      score: 4,
      metadata: { confidence: 'high', reason: 'Strong fit' },
      opportunity: { classification: { type: 'lead' } },
      review: { status: 'llm_reviewed', failed: false },
    }));

    const saved = await saveAiRankingAudit({
      requestId: 'req_1',
      status: 'success',
      requestedModel: 'model-a',
      resolvedModel: 'model-b',
      postCount: 3,
      processedCount: 3,
      llmReviewedCount: 3,
      entries,
      auditContext: {
        clientRunId: 'run_1',
        chunkIndex: 0,
        totalChunks: 1,
        totalFeedPosts: 3,
      },
    }, {
      chunkSize: 2,
    });

    expect(saved.auditId).toBeTruthy();
    expect(mockStore.get(buildAiRankingAuditMetaKey(saved.auditId))).toMatchObject({
      requestId: 'req_1',
      requestedModel: 'model-a',
      resolvedModel: 'model-b',
      chunkCount: 2,
    });
    expect(mockStore.get(buildAiRankingAuditChunkKey(saved.auditId, 0))).toHaveLength(2);
    expect(mockStore.get(buildAiRankingAuditChunkKey(saved.auditId, 1))).toHaveLength(1);

    const audits = await listAiRankingAudits({ limit: 10 });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      auditId: saved.auditId,
      clientRunId: 'run_1',
      postCount: 3,
      llmReviewedCount: 3,
    });

    const restored = await getAiRankingAudit(saved.auditId);
    expect(restored.entries).toHaveLength(3);
    expect(restored.entries[0]).toMatchObject({
      postId: 'p1',
      ranking: {
        score: 4,
        review: { status: 'llm_reviewed', failed: false },
      },
    });
  });

  test('stores recent audit summaries in the global index', async () => {
    await saveAiRankingAudit({
      requestId: 'req_2',
      status: 'partial',
      requestedModel: 'model-a',
      resolvedModel: 'model-a',
      postCount: 1,
      processedCount: 1,
      failedCount: 1,
      failedReviewCount: 1,
      entries: [{
        postId: 'p1',
        post: { id: 'p1', title: 'Post 1', subreddit: 'test' },
        score: 1,
        metadata: { confidence: 'low', reason: 'Fallback' },
        opportunity: { classification: { type: 'pain_point' } },
        review: { status: 'failed', failed: true },
      }],
    });

    const indexEntries = mockStore.get(AI_RANKING_AUDIT_INDEX_KEY);
    expect(Array.isArray(indexEntries)).toBe(true);
    expect(indexEntries[0]).toMatchObject({
      status: 'partial',
      failedReviewCount: 1,
      failedCount: 1,
    });
  });
});
