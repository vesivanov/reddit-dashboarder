(function initDashboardFetchModule(globalScope) {
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function getRetryAfterSeconds(response, payload = null) {
    return Number(payload?.retryAfter)
      || Number(payload?.retry_after_seconds)
      || Number(response?.headers?.get?.('Retry-After'))
      || 0;
  }

  function getEffectiveMaxPages(maxPages, subsCount) {
    const requestedFetchAllPages = Number(maxPages) === 0;
    let effectiveMaxPages = requestedFetchAllPages ? 30 : maxPages;
    if (subsCount >= 20) {
      effectiveMaxPages = Math.min(effectiveMaxPages, 2);
    } else if (subsCount >= 12) {
      effectiveMaxPages = Math.min(effectiveMaxPages, 3);
    } else if (subsCount >= 8) {
      effectiveMaxPages = Math.min(effectiveMaxPages, 4);
    }
    return requestedFetchAllPages && effectiveMaxPages >= 30 ? 0 : effectiveMaxPages;
  }

  function determineSnapshotChunkSize({ subsCount, wantsDeepFetch }) {
    if (subsCount > 21) return wantsDeepFetch ? 6 : 7;
    if (subsCount > 14) return 7;
    if (subsCount > 7 && wantsDeepFetch) return 7;
    return subsCount;
  }

  function shapeSnapshotChunk({ chunkLength, limit, maxPages }) {
    let chunkLimit = limit;
    const requestedFetchAllPages = Number(maxPages) === 0;
    const requestedChunkMaxPages = requestedFetchAllPages ? 30 : maxPages;
    let chunkMaxPages = requestedFetchAllPages ? 30 : maxPages;
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
    const normalizedChunkMaxPages = requestedFetchAllPages && chunkMaxPages >= 30 ? 0 : chunkMaxPages;
    return {
      chunkLimit,
      chunkMaxPages: normalizedChunkMaxPages,
      chunkWasCapped: chunkLimit !== limit || chunkMaxPages !== requestedChunkMaxPages,
    };
  }

  function deriveCoverageSummary(payload, perSub) {
    if (payload?.coverage_summary && typeof payload.coverage_summary === 'object') {
      return payload.coverage_summary;
    }

    const summary = { complete1dCount: 0, complete3dCount: 0, complete5dCount: 0 };
    for (const group of Array.isArray(perSub) ? perSub : []) {
      const state = group?.coverage_state || null;
      if (state?.complete_1d) summary.complete1dCount += 1;
      if (state?.complete_3d) summary.complete3dCount += 1;
      if (state?.complete_5d) summary.complete5dCount += 1;
    }
    return summary;
  }

  function buildFetchSummary(payload, perSub, options = {}) {
    const requestedFetchAllPages = Boolean(options?.requestedFetchAllPages);
    const depthAutoCapped = Boolean(options?.depthAutoCapped);
    const effectiveMaxPages = Number(options?.effectiveMaxPages);
    const targetWindowDays = Math.max(1, Number(options?.targetWindowDays) || Number(payload?.days) || 1);
    const subsCount = Number(options?.subsCount) || 0;
    const timedOutSubs = Array.isArray(payload?.timed_out_subreddits) ? payload.timed_out_subreddits : [];
    const rateLimitedSubs = Array.isArray(payload?.rate_limited_subreddits) ? payload.rate_limited_subreddits : [];
    const partialSubs = Array.isArray(perSub) ? perSub.filter(group => group?.partial).map(group => group.subreddit) : [];
    const erroredSubs = Array.isArray(perSub) ? perSub.filter(group => group?.error).map(group => group.subreddit) : [];
    const attemptedSubs = Array.isArray(perSub) ? perSub.length : 0;
    const coverageSummary = deriveCoverageSummary(payload, perSub);
    const coverageDetail = coverageSummary && attemptedSubs > 0
      ? ` Coverage: ${Number(coverageSummary.complete1dCount) || 0}/${attemptedSubs} at 1d, ${Number(coverageSummary.complete3dCount) || 0}/${attemptedSubs} at 3d, ${Number(coverageSummary.complete5dCount) || 0}/${attemptedSubs} at 5d.`
      : '';
    const targetCoverageCount = targetWindowDays >= 5
      ? Number(coverageSummary.complete5dCount) || 0
      : targetWindowDays >= 3
        ? Number(coverageSummary.complete3dCount) || 0
        : Number(coverageSummary.complete1dCount) || 0;
    const incompleteSubs = Array.from(new Set([
      ...timedOutSubs,
      ...rateLimitedSubs,
      ...partialSubs,
      ...erroredSubs,
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

    if (erroredSubs.length > 0) {
      return {
        tone: 'warning',
        status: 'Incomplete',
        detail: `${erroredSubs.length} subreddit fetch${erroredSubs.length === 1 ? '' : 'es'} returned an error.${coverageDetail}`,
        completedSubs,
        attemptedSubs,
      };
    }

    if (attemptedSubs > 0 && targetCoverageCount < attemptedSubs) {
      const targetLabel = targetWindowDays >= 5 ? '5d' : targetWindowDays >= 3 ? '3d' : '1d';
      return {
        tone: 'warning',
        status: 'Shallow',
        detail: `Processed all ${attemptedSubs} subreddits, but only ${targetCoverageCount}/${attemptedSubs} reached ${targetLabel} coverage.${coverageDetail}`,
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
    buildFetchSummary,
    buildSnapshotParams,
    requestSnapshotChunk,
    requestAiRank,
  };
})(typeof window !== 'undefined' ? window : globalThis);
