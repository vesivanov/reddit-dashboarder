(function initDashboardFetchModule(globalScope) {
  function getRetryAfterSeconds(response, payload = null) {
    return Number(payload?.retryAfter)
      || Number(payload?.retry_after_seconds)
      || Number(response?.headers?.get?.('Retry-After'))
      || 0;
  }

  function getEffectiveMaxPages(maxPages, subsCount) {
    let effectiveMaxPages = maxPages;
    if (subsCount >= 20) {
      effectiveMaxPages = Math.min(effectiveMaxPages, 2);
    } else if (subsCount >= 12) {
      effectiveMaxPages = Math.min(effectiveMaxPages, 3);
    } else if (subsCount >= 8) {
      effectiveMaxPages = Math.min(effectiveMaxPages, 4);
    }
    return effectiveMaxPages;
  }

  function determineSnapshotChunkSize({ subsCount, wantsDeepFetch }) {
    if (subsCount > 21) return wantsDeepFetch ? 6 : 7;
    if (subsCount > 14) return 7;
    if (subsCount > 7 && wantsDeepFetch) return 7;
    return subsCount;
  }

  function shapeSnapshotChunk({ chunkLength, limit, maxPages }) {
    let chunkLimit = limit;
    let chunkMaxPages = maxPages;
    if (chunkLength >= 12) {
      chunkLimit = Math.min(25, chunkLimit);
    } else if (chunkLength >= 6) {
      chunkLimit = Math.min(25, chunkLimit);
    }
    if (chunkLength >= 20) {
      chunkMaxPages = Math.min(chunkMaxPages, 2);
    } else if (chunkLength >= 12) {
      chunkMaxPages = Math.min(chunkMaxPages, 3);
    } else if (chunkLength >= 8) {
      chunkMaxPages = Math.min(chunkMaxPages, 4);
    }
    return {
      chunkLimit,
      chunkMaxPages,
      chunkWasCapped: chunkLimit !== limit || chunkMaxPages !== maxPages,
    };
  }

  function isCoverageComplete(state, goalCutoffUtc) {
    if (!state) return false;
    if (state.status === 'complete') return true;
    const coveredThrough = Number(state.covered_through_utc) || 0;
    return coveredThrough > 0 && coveredThrough <= goalCutoffUtc;
  }

  function isCoveragePageCapped(state, effectiveMaxPages, goalCutoffUtc) {
    return (
      effectiveMaxPages !== 0
      && Number(state?.page_count || 0) >= effectiveMaxPages
      && !isCoverageComplete(state, goalCutoffUtc)
    );
  }

  function computeCoverageProgress({ subs, coverageStates, coverageResults, effectiveMaxPages, goalCutoffUtc }) {
    const completedSubs = subs.filter((sub) => {
      const state = coverageStates.get(String(sub || '').toLowerCase());
      return isCoverageComplete(state, goalCutoffUtc) || isCoveragePageCapped(state, effectiveMaxPages, goalCutoffUtc);
    }).length;
    const totalPosts = subs.reduce((sum, sub) => {
      const result = coverageResults.get(String(sub || '').toLowerCase());
      return sum + (Array.isArray(result?.posts) ? result.posts.length : 0);
    }, 0);
    return { completedSubs, totalPosts };
  }

  function buildCoverageCounts({ subs, coverageStates }) {
    return {
      complete1dCount: subs.filter((sub) => {
        const state = coverageStates.get(String(sub || '').toLowerCase());
        return Boolean(state?.complete_1d);
      }).length,
      complete3dCount: subs.filter((sub) => {
        const state = coverageStates.get(String(sub || '').toLowerCase());
        return Boolean(state?.complete_3d);
      }).length,
      complete5dCount: subs.filter((sub) => {
        const state = coverageStates.get(String(sub || '').toLowerCase());
        return Boolean(state?.complete_5d);
      }).length,
    };
  }

  function buildFetchSummary(payload, perSub, options = {}) {
    const requestedFetchAllPages = Boolean(options?.requestedFetchAllPages);
    const depthAutoCapped = Boolean(options?.depthAutoCapped);
    const effectiveMaxPages = Number(options?.effectiveMaxPages);
    const subsCount = Number(options?.subsCount) || 0;
    const timedOutSubs = Array.isArray(payload?.timed_out_subreddits) ? payload.timed_out_subreddits : [];
    const rateLimitedSubs = Array.isArray(payload?.rate_limited_subreddits) ? payload.rate_limited_subreddits : [];
    const partialSubs = Array.isArray(perSub) ? perSub.filter(group => group?.partial).map(group => group.subreddit) : [];
    const attemptedSubs = Array.isArray(perSub) ? perSub.length : 0;
    const coverageSummary = payload?.coverage_summary || {};
    const coverageDetail = coverageSummary && attemptedSubs > 0
      ? ` Coverage: ${Number(coverageSummary.complete1dCount) || 0}/${attemptedSubs} at 1d, ${Number(coverageSummary.complete3dCount) || 0}/${attemptedSubs} at 3d, ${Number(coverageSummary.complete5dCount) || 0}/${attemptedSubs} at 5d.`
      : '';
    const incompleteSubs = Array.from(new Set([
      ...timedOutSubs,
      ...rateLimitedSubs,
      ...partialSubs,
    ].filter(Boolean)));
    const completedSubs = Math.max(0, attemptedSubs - incompleteSubs.length);

    if (timedOutSubs.length > 0) {
      return {
        tone: 'warning',
        status: 'Incomplete',
        detail: `Stopped early on ${timedOutSubs.length} subreddit${timedOutSubs.length === 1 ? '' : 's'} because the request timed out.${coverageDetail}`,
        completedSubs,
        attemptedSubs,
      };
    }

    if (rateLimitedSubs.length > 0) {
      return {
        tone: 'warning',
        status: 'Incomplete',
        detail: `Stopped early on ${rateLimitedSubs.length} subreddit${rateLimitedSubs.length === 1 ? '' : 's'} because Reddit rate-limited the request.${coverageDetail}`,
        completedSubs,
        attemptedSubs,
      };
    }

    if (partialSubs.length > 0) {
      return {
        tone: 'warning',
        status: 'Capped',
        detail: `Fetch depth stopped before the full timeframe was exhausted for ${partialSubs.length} subreddit${partialSubs.length === 1 ? '' : 's'}.${coverageDetail}`,
        completedSubs,
        attemptedSubs,
      };
    }

    if (depthAutoCapped && Number.isFinite(effectiveMaxPages)) {
      return {
        tone: 'warning',
        status: 'Capped',
        detail: `Fetch depth was auto-capped to ${effectiveMaxPages === 0 ? 'all pages' : `${effectiveMaxPages} page${effectiveMaxPages === 1 ? '' : 's'}`} across ${subsCount} subreddits to reduce timeouts.${coverageDetail}`,
        completedSubs,
        attemptedSubs,
      };
    }

    return {
      tone: 'success',
      status: 'Complete',
      detail: requestedFetchAllPages
        ? `Fetched all available posts Reddit returned for the selected timeframe.${coverageDetail}`
        : `Fetched the requested scope for the selected timeframe.${coverageDetail}`,
      completedSubs: attemptedSubs,
      attemptedSubs,
    };
  }

  function buildCoverageQuery({
    subs,
    mode,
    time,
    days,
    targetWindowDays,
  }) {
    return new URLSearchParams({
      subs: subs.join(','),
      mode,
      time,
      days: String(days),
      target_window_days: String(targetWindowDays),
    });
  }

  async function requestCoverage({
    coverageQuery,
    forceRefresh = false,
    signal,
  }) {
    const queryString = coverageQuery.toString();
    const initialResponse = await fetch(`/api/reddit/coverage?${queryString}`, {
      method: forceRefresh ? 'DELETE' : 'GET',
      signal,
      credentials: 'include',
      ...(forceRefresh ? { headers: { 'Cache-Control': 'no-cache' } } : {}),
    });

    if (!initialResponse.ok) {
      return {
        ok: false,
        status: initialResponse.status,
        response: initialResponse,
        payload: null,
      };
    }

    const finalResponse = forceRefresh
      ? await fetch(`/api/reddit/coverage?${queryString}`, {
          signal,
          credentials: 'include',
          headers: { 'Cache-Control': 'no-cache' },
        })
      : initialResponse;

    let payload = null;
    try {
      payload = await finalResponse.json();
    } catch {}

    return {
      ok: finalResponse.ok,
      status: finalResponse.status,
      response: finalResponse,
      payload,
    };
  }

  async function requestCoverageAdvance({
    body,
    forceRefresh = false,
    signal,
  }) {
    const response = await fetch('/api/reddit/advance', {
      method: 'POST',
      signal,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(forceRefresh ? { 'Cache-Control': 'no-cache' } : {}),
      },
      body: JSON.stringify(body),
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch {}

    return {
      ok: response.ok,
      status: response.status,
      response,
      payload,
      retryAfterSeconds: getRetryAfterSeconds(response, payload),
    };
  }

  function buildSnapshotParams({
    chunkSubs,
    mode,
    time,
    days,
    limit,
    maxPages,
    forceRefresh = false,
    chunkIdx = 0,
  }) {
    const params = new URLSearchParams({
      subs: chunkSubs.join(','),
      mode,
      time,
      days: String(days),
      limit: String(limit),
    });
    params.set('max_pages', maxPages === 0 ? 'all' : String(maxPages));
    if (forceRefresh) {
      params.set('_ts', `${Date.now()}_${chunkIdx}`);
      params.set('fresh', '1');
    }
    return params;
  }

  async function requestSnapshotChunk({
    apiUrl,
    params,
    forceRefresh = false,
    signal,
  }) {
    const requestUrl = `${apiUrl}?${params.toString()}`;
    let response = await fetch(requestUrl, {
      signal,
      ...(forceRefresh ? { headers: { 'Cache-Control': 'no-cache' } } : {}),
    });

    if (forceRefresh && response.status >= 500) {
      const fallbackParams = new URLSearchParams(params);
      fallbackParams.delete('_ts');
      fallbackParams.delete('fresh');
      const fallbackUrl = `${apiUrl}?${fallbackParams.toString()}`;
      const fallbackResponse = await fetch(fallbackUrl, { signal });
      if (fallbackResponse.ok) {
        response = fallbackResponse;
      }
    }

    let payload = null;
    if (response.ok || response.status === 429) {
      try {
        payload = await response.json();
      } catch {}
    }

    return {
      ok: response.ok,
      status: response.status,
      response,
      payload,
      rateLimitedHeader: response.headers.get('X-Rate-Limited') === '1',
      retryAfterSeconds: getRetryAfterSeconds(response, payload),
    };
  }

  async function requestAiRank(payload) {
    const response = await fetch('/api/reddit/ai-rank', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    let body = null;
    try {
      body = await response.json();
    } catch {}

    return {
      ok: response.ok,
      status: response.status,
      response,
      body,
      retryAfterSeconds: getRetryAfterSeconds(response, body),
    };
  }

  globalScope.RDDFetchClient = {
    getRetryAfterSeconds,
    getEffectiveMaxPages,
    determineSnapshotChunkSize,
    shapeSnapshotChunk,
    isCoverageComplete,
    isCoveragePageCapped,
    computeCoverageProgress,
    buildCoverageCounts,
    buildFetchSummary,
    buildCoverageQuery,
    requestCoverage,
    requestCoverageAdvance,
    buildSnapshotParams,
    requestSnapshotChunk,
    requestAiRank,
  };
})(typeof window !== 'undefined' ? window : globalThis);
