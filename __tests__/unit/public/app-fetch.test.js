const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadFetchClient() {
  const source = fs.readFileSync(path.join(process.cwd(), 'public/app-fetch.js'), 'utf8');
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
  return context.window.RDDFetchClient;
}

describe('app fetch helpers', () => {
  test('caps fetch-all requests for large subreddit batches on the client', () => {
    const fetchClient = loadFetchClient();

    expect(fetchClient.getEffectiveMaxPages(0, 31)).toBe(2);
    expect(fetchClient.getEffectiveMaxPages(0, 3)).toBe(0);

    const shaped = fetchClient.shapeSnapshotChunk({
      chunkLength: 21,
      limit: 100,
      maxPages: 0,
    });

    expect(shaped.chunkMaxPages).toBe(2);
    expect(shaped.chunkWasCapped).toBe(true);
  });

  test('treats incomplete coverage as shallow instead of complete', () => {
    const fetchClient = loadFetchClient();

    const summary = fetchClient.buildFetchSummary({
      request_capped: true,
      days: 5,
    }, [
      {
        subreddit: 'alpha',
        posts: [],
        partial: false,
        error: null,
        coverage_state: { complete_1d: false, complete_3d: false, complete_5d: false },
      },
      {
        subreddit: 'beta',
        posts: [],
        partial: false,
        error: null,
        coverage_state: { complete_1d: false, complete_3d: false, complete_5d: false },
      },
    ], {
      requestedFetchAllPages: true,
      depthAutoCapped: true,
      effectiveMaxPages: 2,
      subsCount: 2,
      targetWindowDays: 5,
    });

    expect(summary.status).toBe('Shallow');
    expect(summary.tone).toBe('warning');
    expect(summary.completedSubs).toBe(2);
    expect(summary.targetWindowLabel).toBe('5d');
    expect(summary.targetCoverageCount).toBe(0);
    expect(summary.targetCoverageComplete).toBe(false);
    expect(summary.detail).toContain('only 0/2 reached the selected 5d coverage window');
    expect(summary.detail).toContain('Coverage: 0/2 at 1d, 0/2 at 3d, 0/2 at 5d.');
  });

  test('marks the selected target window complete when every subreddit reached it', () => {
    const fetchClient = loadFetchClient();

    const summary = fetchClient.buildFetchSummary({
      request_capped: false,
      days: 3,
    }, [
      {
        subreddit: 'alpha',
        posts: [{ id: 'a1' }],
        partial: false,
        error: null,
        coverage_state: { complete_1d: true, complete_3d: true, complete_5d: false },
      },
      {
        subreddit: 'beta',
        posts: [{ id: 'b1' }],
        partial: false,
        error: null,
        coverage_state: { complete_1d: true, complete_3d: true, complete_5d: false },
      },
    ], {
      requestedFetchAllPages: false,
      depthAutoCapped: false,
      effectiveMaxPages: 3,
      subsCount: 2,
      targetWindowDays: 3,
    });

    expect(summary.status).toBe('Complete');
    expect(summary.tone).toBe('success');
    expect(summary.targetWindowLabel).toBe('3d');
    expect(summary.targetCoverageCount).toBe(2);
    expect(summary.targetCoverageComplete).toBe(true);
    expect(summary.detail).toContain('All 2/2 subreddits reached 3d coverage.');
  });
});
