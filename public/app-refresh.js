(function initDashboardRefreshController(globalScope) {
  function runAutoRefreshNotifications({
    triggeredByAuto,
    perSub,
    previousPostScores,
    notificationsEnabled,
    upvoteThreshold,
    alertKeywords,
    setPreviousPostScores,
  }) {
    if (!triggeredByAuto) {
      return;
    }

    const allNewPosts = perSub.flatMap((group) => group.posts || []);
    const newScores = new Map();
    allNewPosts.forEach((post) => newScores.set(post.id, Number(post.score) || 0));
    setPreviousPostScores(newScores);

    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
      return;
    }

    if (notificationsEnabled) {
      allNewPosts.forEach((post) => {
        const previousScore = previousPostScores.get(post.id);
        const currentScore = Number(post.score) || 0;
        if (previousScore !== undefined && previousScore < upvoteThreshold && currentScore >= upvoteThreshold) {
          new Notification('Post crossed threshold!', {
            body: `"${post.title}" now has ${currentScore} upvotes`,
            icon: '/favicon.ico',
          });
        }
      });
    }

    if (String(alertKeywords || '').trim()) {
      const keywords = String(alertKeywords)
        .toLowerCase()
        .split(',')
        .map((keyword) => keyword.trim())
        .filter(Boolean);

      allNewPosts.forEach((post) => {
        if (previousPostScores.has(post.id)) {
          return;
        }
        const title = String(post.title || '').toLowerCase();
        const selftext = String(post.selftext || '').toLowerCase();
        const matchedKeyword = keywords.find((keyword) => title.includes(keyword) || selftext.includes(keyword));
        if (matchedKeyword) {
          new Notification(`Keyword "${matchedKeyword}" found!`, {
            body: post.title,
            icon: '/favicon.ico',
          });
        }
      });
    }
  }

  async function runSnapshotRefreshFlow({
    subs,
    subsCount,
    mode,
    time,
    days,
    limit,
    maxPages,
    forceRefresh,
    triggeredByAuto,
    wantsDeepFetch,
    effectiveMaxPages,
    controller,
    defaultApiUrl,
    data,
    previousPostScores,
    notificationsEnabled,
    upvoteThreshold,
    alertKeywords,
    aiLlmPostLimit,
    determineSnapshotChunkSize,
    shapeSnapshotChunk,
    buildSnapshotParams,
    requestSnapshotChunk,
    buildFetchSummary,
    setFetchMethod,
    setSidecarSyncSuppressedUntil,
    setFetchActivity,
    setNeedsAuth,
    setAuthenticated,
    setAuthChecking,
    setFetchSummary,
    setError,
    setStorageStatus,
    setRateLimitPauseUntil,
    setData,
    setFetchedAt,
    setSnapshotInfo,
    setPreviousPostScores,
    runAiRanking,
    localPauseUntil,
  }) {
    setFetchMethod('server');
    setSidecarSyncSuppressedUntil(null);

    const chunkSize = determineSnapshotChunkSize({ subsCount, wantsDeepFetch });
    const subChunks = [];
    for (let index = 0; index < subs.length; index += chunkSize) {
      subChunks.push(subs.slice(index, index + chunkSize));
    }

    const mergedRequestStartedAt = Date.now();
    const mergedPayload = {
      mode,
      time,
      days,
      limit,
      max_pages: maxPages,
      fetch_all_pages: maxPages === 0,
      results: [],
      fetched_at: Date.now(),
      request_capped: effectiveMaxPages !== maxPages,
      rate_limited: false,
      rate_limited_subreddits: [],
      retry_after_seconds: 0,
      timed_out: false,
      timed_out_subreddits: [],
      auth_mode: null,
      metrics: {
        subredditCount: 0,
        totalPosts: 0,
        rateLimitedCount: 0,
        durationMs: 0,
        timedOutCount: 0,
        retryAfterSeconds: 0,
        redditRequestCount: 0,
        sharedCooldownHit: false,
        requestCapped: effectiveMaxPages !== maxPages,
      },
    };
    let sawRateLimitedHeader = false;

    for (let chunkIndex = 0; chunkIndex < subChunks.length; chunkIndex += 1) {
      const chunkSubs = subChunks[chunkIndex];
      const { chunkLimit, chunkMaxPages, chunkWasCapped } = shapeSnapshotChunk({
        chunkLength: chunkSubs.length,
        limit,
        maxPages: effectiveMaxPages,
      });
      setFetchActivity({
        status: `Fetching batch ${chunkIndex + 1}/${subChunks.length}`,
        detail: `Requesting ${chunkSubs.length} subreddit${chunkSubs.length === 1 ? '' : 's'} through the snapshot API.`,
      });

      const params = buildSnapshotParams({
        chunkSubs,
        mode,
        time,
        days,
        limit: chunkLimit,
        maxPages: chunkMaxPages,
        totalSubsCount: subsCount,
        forceRefresh,
        chunkIdx: chunkIndex,
      });
      const snapshotResult = await requestSnapshotChunk({
        apiUrl: defaultApiUrl,
        params,
        forceRefresh,
        signal: controller.signal,
      });

      if (snapshotResult.status === 401) {
        setNeedsAuth(true);
        setAuthenticated(false);
        setAuthChecking(false);
        setFetchSummary(null);
        setError('Sign in with Reddit to fetch your dashboard.');
        return localPauseUntil;
      }

      if (snapshotResult.status === 429) {
        const responseBody = snapshotResult.payload;
        const retryAfterSeconds = snapshotResult.retryAfterSeconds;
        if (retryAfterSeconds > 0) {
          localPauseUntil = Date.now() + retryAfterSeconds * 1000;
          setRateLimitPauseUntil(localPauseUntil);
        }
        const isAppLimit = responseBody?.source === 'app';
        const sourceLabel = isAppLimit ? 'App throttle' : 'Rate limit';
        const sourceMessage = responseBody?.message || (isAppLimit ? 'Too many requests from this browser.' : 'Dashboard request limit reached.');
        setFetchSummary(null);
        setError(`${sourceLabel}: ${sourceMessage}${retryAfterSeconds > 0 ? ` Retry in ~${retryAfterSeconds}s.` : ''}`);
        return localPauseUntil;
      }

      if (!snapshotResult.ok) {
        throw new Error(`HTTP ${snapshotResult.status}`);
      }

      sawRateLimitedHeader = sawRateLimitedHeader || snapshotResult.rateLimitedHeader;
      const chunkPayload = snapshotResult.payload;
      if (chunkPayload?.storage) {
        setStorageStatus(chunkPayload.storage);
      }
      const chunkRetryAfter = snapshotResult.retryAfterSeconds;
      mergedPayload.results.push(...(Array.isArray(chunkPayload.results) ? chunkPayload.results : []));
      mergedPayload.rate_limited = mergedPayload.rate_limited || Boolean(chunkPayload.rate_limited);
      mergedPayload.timed_out = mergedPayload.timed_out || Boolean(chunkPayload.timed_out);
      mergedPayload.retry_after_seconds = Math.max(mergedPayload.retry_after_seconds, chunkRetryAfter);
      mergedPayload.rate_limited_subreddits.push(...(Array.isArray(chunkPayload.rate_limited_subreddits) ? chunkPayload.rate_limited_subreddits : []));
      mergedPayload.timed_out_subreddits.push(...(Array.isArray(chunkPayload.timed_out_subreddits) ? chunkPayload.timed_out_subreddits : []));
      mergedPayload.auth_mode = mergedPayload.auth_mode || chunkPayload?.auth_mode || null;
      mergedPayload.metrics.subredditCount += Number(chunkPayload?.metrics?.subredditCount) || chunkSubs.length;
      mergedPayload.metrics.totalPosts += Number(chunkPayload?.metrics?.totalPosts) || 0;
      mergedPayload.metrics.rateLimitedCount += Number(chunkPayload?.metrics?.rateLimitedCount) || 0;
      mergedPayload.metrics.timedOutCount += Number(chunkPayload?.metrics?.timedOutCount) || 0;
      mergedPayload.metrics.retryAfterSeconds = Math.max(mergedPayload.metrics.retryAfterSeconds, Number(chunkPayload?.metrics?.retryAfterSeconds) || chunkRetryAfter || 0);
      mergedPayload.metrics.redditRequestCount += Number(chunkPayload?.metrics?.redditRequestCount) || 0;
      mergedPayload.metrics.sharedCooldownHit = mergedPayload.metrics.sharedCooldownHit || Boolean(chunkPayload?.metrics?.sharedCooldownHit);
      mergedPayload.request_capped = mergedPayload.request_capped || Boolean(chunkPayload?.request_capped) || chunkWasCapped;
      mergedPayload.metrics.requestCapped = mergedPayload.metrics.requestCapped || Boolean(chunkPayload?.metrics?.requestCapped) || mergedPayload.request_capped;

      if (chunkPayload?.rate_limited || snapshotResult.rateLimitedHeader) {
        break;
      }

      if (chunkIndex < subChunks.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
    }

    mergedPayload.fetched_at = Date.now();
    mergedPayload.rate_limited_subreddits = Array.from(new Set(mergedPayload.rate_limited_subreddits));
    mergedPayload.timed_out_subreddits = Array.from(new Set(mergedPayload.timed_out_subreddits));
    mergedPayload.metrics.durationMs = Date.now() - mergedRequestStartedAt;

    const payload = mergedPayload;
    const retryAfterSeconds = Number(payload?.retry_after_seconds) || 0;
    if (sawRateLimitedHeader || payload.rate_limited) {
      if (retryAfterSeconds > 0) {
        localPauseUntil = Date.now() + retryAfterSeconds * 1000;
        setRateLimitPauseUntil(localPauseUntil);
      }
      const affected = Array.isArray(payload.rate_limited_subreddits) ? payload.rate_limited_subreddits.length : 0;
      const affectedMessage = affected ? ` on ${affected} subreddit${affected === 1 ? '' : 's'}` : '';
      const cooldownMessage = retryAfterSeconds > 0 ? `Cooling down ~${retryAfterSeconds}s.` : 'Try fewer subs or smaller fetch depth.';
      setError(`Reddit rate limit${affectedMessage}. ${cooldownMessage}`);
    } else {
      localPauseUntil = null;
      setRateLimitPauseUntil(null);
    }

    const results = Array.isArray(payload.results) ? payload.results : [];
    const previousBySub = new Map((data || []).map((item) => [String(item.subreddit || '').toLowerCase(), item]));
    const perSub = subs.map((subreddit) => {
      const subKey = subreddit.toLowerCase();
      const match = results.find((result) => (result.subreddit || '').toLowerCase() === subKey);
      const previous = previousBySub.get(subKey);

      if (!match && previous) {
        return { ...previous, subreddit, stale: true, stale_reason: 'missing_result' };
      }

      if (match?.error && previous) {
        return {
          ...previous,
          subreddit,
          stale: true,
          stale_reason: match.error_code || 'fetch_error',
          error: match.error || null,
        };
      }

      if (match) {
        return {
          subreddit: match.subreddit,
          meta: match.meta || previous?.meta || null,
          posts: Array.isArray(match.posts) ? match.posts : [],
          partial: Boolean(match.partial),
          coverage_state: match.coverage_state || null,
          error: match.error || null,
          stale: false,
        };
      }

      return {
        subreddit,
        posts: previous?.posts || [],
        meta: previous?.meta || null,
        partial: false,
        error: null,
        stale: Boolean(previous),
        stale_reason: previous ? 'fallback_previous' : null,
      };
    });

    setNeedsAuth(false);
    setAuthenticated(payload?.auth_mode !== 'public');
    setAuthChecking(false);
    setData(perSub);
    setFetchedAt(Number(payload?.fetched_at) || Date.now());
    setSnapshotInfo(payload?.snapshot || null);
    setFetchSummary(buildFetchSummary(payload, perSub, {
      requestedFetchAllPages: maxPages === 0 || Boolean(payload?.fetch_all_pages),
      depthAutoCapped: Boolean(payload?.request_capped),
      effectiveMaxPages: payload?.request_capped ? effectiveMaxPages : maxPages,
      subsCount,
      targetWindowDays: days,
    }));

    const totalFetchedPosts = perSub.reduce((sum, group) => sum + ((group?.posts || []).length), 0);
    setFetchActivity({
      status: 'Fetch complete',
      detail: `Fetched ${totalFetchedPosts} post${totalFetchedPosts === 1 ? '' : 's'}. Starting opportunity ranking next.`,
    });

    await runAiRanking({ perSub, triggeredByAuto, llmPostLimit: aiLlmPostLimit });
    runAutoRefreshNotifications({
      triggeredByAuto,
      perSub,
      previousPostScores,
      notificationsEnabled,
      upvoteThreshold,
      alertKeywords,
      setPreviousPostScores,
    });

    return localPauseUntil;
  }

  globalScope.RDDRefreshController = {
    runAutoRefreshNotifications,
    runSnapshotRefreshFlow,
  };
})(typeof window !== 'undefined' ? window : globalThis);
