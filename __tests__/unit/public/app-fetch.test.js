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
    expect(summary.detail).toContain('only 0/2 reached 5d coverage');
    expect(summary.detail).toContain('Coverage: 0/2 at 1d, 0/2 at 3d, 0/2 at 5d.');
  });
});
