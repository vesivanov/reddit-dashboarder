jest.mock('../../../lib/storage', () => ({
  get: jest.fn(),
  set: jest.fn(),
  compareAndSwap: jest.fn(),
}));

const { runHandler } = require('../../helpers/run-handler');
const { makeSignedCookie } = require('../../../lib/cookies');
const storage = require('../../../lib/storage');
const auditsHandler = require('../../../lib/api-handlers/reddit/ai-rank-audits');
const {
  buildAiRankingAuditMetaKey,
  buildAiRankingAuditChunkKey,
} = require('../../../lib/repos/ai-ranking-audits');

describe('/api/reddit/ai-rank/audits', () => {
  const mockStore = new Map();

  beforeEach(() => {
    process.env.SESSION_COOKIE_SECRET = process.env.SESSION_COOKIE_SECRET || 'test_secret_32_bytes_long_hex_string_123456';
    mockStore.clear();
    storage.get.mockReset();
    storage.set.mockReset();
    storage.compareAndSwap.mockReset();

    storage.get.mockImplementation(async (key) => (
      mockStore.has(key) ? mockStore.get(key) : null
    ));
  });

  test('requires an authenticated session', async () => {
    const res = await runHandler(auditsHandler, {
      method: 'GET',
      url: '/api/reddit/ai-rank/audits',
      headers: { origin: 'http://localhost:3000' },
    });

    expect(res.status).toBe(401);
  });

  test('returns a saved full audit by id', async () => {
    mockStore.set(buildAiRankingAuditMetaKey('audit_1'), {
      auditId: 'audit_1',
      requestId: 'req_1',
      chunkCount: 1,
      requestedModel: 'model-a',
      resolvedModel: 'model-b',
      postCount: 1,
    });
    mockStore.set(buildAiRankingAuditChunkKey('audit_1', 0), [{
      postId: 'p1',
      post: { id: 'p1', title: 'Need SEO help', subreddit: 'smallbusiness' },
      ranking: {
        postId: 'p1',
        score: 5,
        metadata: { confidence: 'high', reason: 'Strong fit' },
        opportunity: { classification: { type: 'lead' } },
        review: { status: 'llm_reviewed', failed: false },
      },
    }]);

    const cookie = makeSignedCookie('access', 'session-token');
    const res = await runHandler(auditsHandler, {
      method: 'GET',
      url: '/api/reddit/ai-rank/audits?id=audit_1',
      headers: { cookie, origin: 'http://localhost:3000' },
    });

    expect(res.status).toBe(200);
    expect(res.body.audit).toMatchObject({
      auditId: 'audit_1',
      entries: [{
        postId: 'p1',
        ranking: {
          score: 5,
          review: { status: 'llm_reviewed', failed: false },
        },
      }],
    });
  });
});
