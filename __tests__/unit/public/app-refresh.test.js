const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadRefreshController() {
  const source = fs.readFileSync(path.join(process.cwd(), 'public/app-refresh.js'), 'utf8');
  const context = {
    window: {},
    globalThis: {},
    console,
    setTimeout,
    clearTimeout,
    URLSearchParams,
  };
  context.globalThis = context;
  vm.runInNewContext(source, context);
  return context.window.RDDRefreshController;
}

describe('app refresh controller', () => {
  test('uses the overall capped depth and passes total_subs_count to snapshot chunks', async () => {
    const controller = loadRefreshController();
    const requestedParams = [];

    await controller.runSnapshotRefreshFlow({
      subs: Array.from({ length: 31 }, (_, index) => `sub${index + 1}`),
      subsCount: 31,
      mode: 'new',
      time: 'day',
      days: 5,
      limit: 100,
      maxPages: 0,
      forceRefresh: false,
      triggeredByAuto: false,
      wantsDeepFetch: true,
      effectiveMaxPages: 2,
      controller: { signal: {} },
      defaultApiUrl: '/api/reddit/snapshot',
      data: [],
      previousPostScores: new Map(),
      notificationsEnabled: false,
      upvoteThreshold: 0,
      alertKeywords: '',
      aiLlmPostLimit: 20,
      determineSnapshotChunkSize: () => 6,
      shapeSnapshotChunk: ({ limit, maxPages }) => ({
        chunkLimit: Math.min(25, limit),
        chunkMaxPages: maxPages,
        chunkWasCapped: false,
      }),
      buildSnapshotParams: (options) => {
        const params = new URLSearchParams({
          subs: options.chunkSubs.join(','),
          max_pages: options.maxPages === 0 ? 'all' : String(options.maxPages),
          total_subs_count: String(options.totalSubsCount),
        });
        requestedParams.push(Object.fromEntries(params.entries()));
        return params;
      },
      requestSnapshotChunk: async () => ({
        ok: true,
        status: 200,
        payload: {
          results: [],
          metrics: {
            subredditCount: 0,
            totalPosts: 0,
            rateLimitedCount: 0,
            timedOutCount: 0,
            retryAfterSeconds: 0,
            redditRequestCount: 0,
            sharedCooldownHit: false,
            requestCapped: false,
          },
          rate_limited_subreddits: [],
          timed_out_subreddits: [],
          request_capped: false,
        },
        rateLimitedHeader: false,
        retryAfterSeconds: 0,
      }),
      buildFetchSummary: () => null,
      setFetchMethod: () => {},
      setSidecarSyncSuppressedUntil: () => {},
      setFetchActivity: () => {},
      setNeedsAuth: () => {},
      setAuthenticated: () => {},
      setAuthChecking: () => {},
      setFetchSummary: () => {},
      setError: () => {},
      setStorageStatus: () => {},
      setRateLimitPauseUntil: () => {},
      setData: () => {},
      setFetchedAt: () => {},
      setSnapshotInfo: () => {},
      setPreviousPostScores: () => {},
      runAiRanking: async () => {},
      localPauseUntil: null,
    });

    expect(requestedParams.length).toBeGreaterThan(0);
    expect(requestedParams.every((entry) => entry.max_pages === '2')).toBe(true);
    expect(requestedParams.every((entry) => entry.total_subs_count === '31')).toBe(true);
  });
});
