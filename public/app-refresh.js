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
    syncDashboardSnapshot,
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
      request_capped: false,
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
        requestCapped: false,
      },
    };
    let sawRateLimitedHeader = false;

    for (let chunkIndex = 0; chunkIndex < subChunks.length; chunkIndex += 1) {
      const chunkSubs = subChunks[chunkIndex];
      const { chunkLimit, chunkMaxPages, chunkWasCapped } = shapeSnapshotChunk({
        chunkLength: chunkSubs.length,
        limit,
        maxPages,
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
    }));

    const totalFetchedPosts = perSub.reduce((sum, group) => sum + ((group?.posts || []).length), 0);
    setFetchActivity({
      status: 'Fetch complete',
      detail: `Fetched ${totalFetchedPosts} post${totalFetchedPosts === 1 ? '' : 's'}. Starting opportunity ranking next.`,
    });

    if (payload?.auth_mode !== 'public') {
      await syncDashboardSnapshot(perSub);
    }

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

  async function startCoverageRefreshFlow({
    subs,
    subsCount,
    mode,
    time,
    days,
    limit,
    maxPages,
    forceRefresh,
    triggeredByAuto,
    effectiveMaxPages,
    controller,
    refreshRunId,
    coverageAbortRef,
    coverageRunIdRef,
    data,
    authenticated,
    autoRefreshEnabled,
    autoRefreshInterval,
    minAutoRefreshMinutes,
    getAutoRefreshPlan,
    aiLlmPostLimit,
    buildCoverageQuery,
    requestCoverage,
    requestCoverageAdvance,
    isCoverageComplete,
    isCoveragePageCapped,
    computeCoverageProgress,
    buildCoverageCounts,
    buildFetchSummary,
    setFetchMethod,
    setSidecarSyncSuppressedUntil,
    setFetchSummary,
    setFetchActivity,
    setData,
    setFetchedAt,
    setSnapshotInfo,
    setStorageStatus,
    setNeedsAuth,
    setAuthenticated,
    setAuthChecking,
    setError,
    setRateLimitPauseUntil,
    setLoading,
    setNextRefreshAt,
    setLastAutoRefreshAt,
    syncDashboardSnapshot,
    runAiRanking,
  }) {
    setFetchMethod('paged');
    const pagedStartedAt = Date.now();
    const skipSyncForLargeBatch = subsCount >= 12;
    if (skipSyncForLargeBatch) {
      setSidecarSyncSuppressedUntil(Date.now() + 30 * 60 * 1000);
    } else {
      setSidecarSyncSuppressedUntil(null);
    }

    const pageLimit = Math.min(subsCount >= 20 ? 10 : (subsCount >= 12 ? 15 : 25), limit);
    const targetWindowDays = Math.max(1, Math.min(days, 5));
    const coverageQuery = buildCoverageQuery({
      subs,
      mode,
      time,
      days,
      targetWindowDays,
    });
    const coverageStates = new Map();
    const coverageResults = new Map();
    let authMode = null;
    let rateLimitedSubs = [];
    let pagedRetryAfterSeconds = 0;
    let globalCooldownUntil = 0;
    let localPauseUntil = null;

    const isCurrentCoverageRun = () => (
      coverageRunIdRef.current === refreshRunId
      && coverageAbortRef.current === controller
      && !controller.signal.aborted
    );

    const goalCutoffUtc = () => Math.floor(Date.now() / 1000) - (targetWindowDays * 86400);
    const applyCoverage = (summary, results = []) => {
      if (summary && Array.isArray(summary.subreddits)) {
        summary.subreddits.forEach((entry) => {
          coverageStates.set(String(entry.subreddit || '').toLowerCase(), entry);
        });
      }
      if (Array.isArray(results)) {
        results.forEach((entry) => {
          const subKey = String(entry?.subreddit || '').toLowerCase();
          if (!subKey) return;
          coverageResults.set(subKey, entry);
          if (entry?.state) {
            coverageStates.set(subKey, entry.state);
          }
        });
      }
    };
    const buildPerSubFromCoverage = () => {
      const previousBySub = new Map((data || []).map((item) => [String(item.subreddit || '').toLowerCase(), item]));
      return subs.map((sub) => {
        const subKey = String(sub || '').toLowerCase();
        const state = coverageStates.get(subKey);
        const result = coverageResults.get(subKey);
        const previous = previousBySub.get(subKey);

        if (result) {
          return {
            subreddit: sub,
            meta: result?.state?.meta || result?.meta || state?.meta || previous?.meta || null,
            posts: Array.isArray(result?.posts) ? result.posts : (previous?.posts || []),
            partial: isCoveragePageCapped(state, effectiveMaxPages, goalCutoffUtc()),
            coverage_state: state || null,
            error: state?.last_error || null,
            stale: false,
          };
        }

        return {
          subreddit: sub,
          posts: previous?.posts || [],
          meta: previous?.meta || state?.meta || null,
          partial: isCoveragePageCapped(state, effectiveMaxPages, goalCutoffUtc()),
          coverage_state: state || previous?.coverage_state || null,
          error: state?.last_error || null,
          stale: Boolean(previous),
          stale_reason: previous ? 'coverage_pending' : null,
        };
      });
    };
    const syncVisibleCoverageState = (summaryOverride = null) => {
      const perSub = buildPerSubFromCoverage();
      setData(perSub);
      setFetchedAt(Date.now());
      setSnapshotInfo(null);
      if (summaryOverride) {
        setFetchSummary(summaryOverride);
      }
      return perSub;
    };

    const coverageResult = await requestCoverage({
      coverageQuery,
      forceRefresh,
      signal: controller.signal,
    });
    if (!coverageResult.ok) {
      throw new Error(`HTTP ${coverageResult.status}`);
    }

    const initialCoverage = coverageResult.payload;
    if (initialCoverage?.storage) {
      setStorageStatus(initialCoverage.storage);
    }
    const coverageScopeId = initialCoverage?.scopeId || null;
    applyCoverage(initialCoverage?.summary, initialCoverage?.results);
    syncVisibleCoverageState({
      tone: 'accent',
      status: 'Running',
      detail: `Loaded cached coverage for ${subsCount} subreddits. Resuming any missing pages now.`,
      completedSubs: computeCoverageProgress({
        subs,
        coverageStates,
        coverageResults,
        effectiveMaxPages,
        goalCutoffUtc: goalCutoffUtc(),
      }).completedSubs,
      attemptedSubs: subsCount,
    });
    setFetchActivity({
      status: 'Loaded checkpoints',
      detail: `Loaded saved coverage for ${subsCount} subreddit${subsCount === 1 ? '' : 's'}. Resuming missing pages now.`,
    });

    const continueCoverageInBackground = async () => {
      try {
        while (true) {
          if (!isCurrentCoverageRun()) return;
          const { completedSubs, totalPosts } = computeCoverageProgress({
            subs,
            coverageStates,
            coverageResults,
            effectiveMaxPages,
            goalCutoffUtc: goalCutoffUtc(),
          });
          const pendingSubs = subs.filter((sub) => {
            const subKey = String(sub || '').toLowerCase();
            const state = coverageStates.get(subKey);
            if (isCoverageComplete(state, goalCutoffUtc()) || isCoveragePageCapped(state, effectiveMaxPages, goalCutoffUtc())) return false;
            if (Number(state?.cooldown_until || 0) > Date.now()) return false;
            if (globalCooldownUntil > Date.now()) return false;
            return true;
          });

          if (!pendingSubs.length) {
            const nextCooldownUntil = Math.min(...subs
              .map((sub) => {
                const state = coverageStates.get(String(sub || '').toLowerCase());
                if (isCoverageComplete(state, goalCutoffUtc()) || isCoveragePageCapped(state, effectiveMaxPages, goalCutoffUtc())) return Infinity;
                return Number(state?.cooldown_until || 0) || Infinity;
              })
              .concat(globalCooldownUntil > Date.now() ? [globalCooldownUntil] : []));
            if (Number.isFinite(nextCooldownUntil) && nextCooldownUntil > Date.now()) {
              const waitMs = Math.max(750, Math.min(10000, nextCooldownUntil - Date.now()));
              setFetchSummary({
                tone: 'accent',
                status: 'Paused',
                detail: `Coverage is checkpointed. Waiting about ${Math.ceil(waitMs / 1000)}s before the next Reddit request.`,
                completedSubs,
                attemptedSubs: subsCount,
              });
              setFetchActivity({
                status: 'Waiting on Reddit',
                detail: `Checkpointed coverage is paused for about ${Math.ceil(waitMs / 1000)}s before the next Reddit request.`,
              });
              syncVisibleCoverageState();
              await new Promise((resolve) => setTimeout(resolve, waitMs));
              continue;
            }
            break;
          }

          for (let subIdx = 0; subIdx < pendingSubs.length; subIdx += 1) {
            if (!isCurrentCoverageRun()) return;
            const sub = pendingSubs[subIdx];
            const subKey = String(sub || '').toLowerCase();
            const state = coverageStates.get(subKey);
            const pageCount = Number(state?.page_count || 0);
            setFetchSummary({
              tone: 'accent',
              status: 'Running',
              detail: `Checkpointing coverage for r/${sub}. ${completedSubs}/${subsCount} subreddits are already covered or capped. ${totalPosts} posts stored so far.`,
              completedSubs,
              attemptedSubs: subsCount,
            });
            setFetchActivity({
              status: `Fetching r/${sub}`,
              detail: `${completedSubs}/${subsCount} subreddits complete or capped. ${totalPosts} post${totalPosts === 1 ? '' : 's'} stored so far.`,
            });

            const advanceResult = await requestCoverageAdvance({
              body: {
                subs,
                sub,
                mode,
                time,
                days,
                target_window_days: targetWindowDays,
                limit: pageLimit,
                include_meta: subsCount < 12 && pageCount === 0,
                scopeId: coverageScopeId,
              },
              forceRefresh,
              signal: controller.signal,
            });

            if (advanceResult.status === 401) {
              setNeedsAuth(true);
              setAuthenticated(false);
              setAuthChecking(false);
              setFetchSummary(null);
              setError('Sign in with Reddit to fetch your dashboard.');
              return;
            }

            if (advanceResult.status === 429) {
              pagedRetryAfterSeconds = advanceResult.retryAfterSeconds || pagedRetryAfterSeconds || 60;
              globalCooldownUntil = Date.now() + pagedRetryAfterSeconds * 1000;
              localPauseUntil = globalCooldownUntil;
              setRateLimitPauseUntil(localPauseUntil);
              rateLimitedSubs = Array.from(new Set([...rateLimitedSubs, sub]));
              syncVisibleCoverageState({
                tone: 'accent',
                status: 'Paused',
                detail: `Coverage paused for r/${sub}. Too many requests - resuming in about ${pagedRetryAfterSeconds}s.`,
                completedSubs,
                attemptedSubs: subsCount,
              });
              setFetchActivity({
                status: 'Rate limited',
                detail: `Reddit paused coverage for r/${sub}. Retrying in about ${pagedRetryAfterSeconds}s.`,
              });
              break;
            }

            if (!advanceResult.ok) {
              throw new Error(`HTTP ${advanceResult.status}`);
            }

            const advancePayload = advanceResult.payload;
            if (advancePayload?.storage) {
              setStorageStatus(advancePayload.storage);
            }
            if (advancePayload?.rate_limited) {
              pagedRetryAfterSeconds = Number(advancePayload?.retryAfter) || pagedRetryAfterSeconds || 15;
              globalCooldownUntil = Date.now() + pagedRetryAfterSeconds * 1000;
              localPauseUntil = globalCooldownUntil;
              setRateLimitPauseUntil(localPauseUntil);
              rateLimitedSubs = Array.from(new Set([...rateLimitedSubs, sub]));
              if (advancePayload?.summary || advancePayload?.result) {
                applyCoverage(advancePayload?.summary, advancePayload?.result ? [advancePayload.result] : []);
              }
              syncVisibleCoverageState({
                tone: 'accent',
                status: 'Paused',
                detail: `Saved progress for r/${sub}. Reddit asked for a short cooldown, so coverage will resume in about ${pagedRetryAfterSeconds}s.`,
                completedSubs,
                attemptedSubs: subsCount,
              });
              setFetchActivity({
                status: 'Cooldown saved',
                detail: `Saved progress for r/${sub}. Coverage will resume in about ${pagedRetryAfterSeconds}s.`,
              });
              break;
            }
            if (advancePayload?.advanced === false && Number(advancePayload?.cooldown_until || 0) > Date.now()) {
              globalCooldownUntil = Number(advancePayload.cooldown_until);
              localPauseUntil = globalCooldownUntil;
              setRateLimitPauseUntil(localPauseUntil);
              if (advancePayload?.summary || advancePayload?.result) {
                applyCoverage(advancePayload?.summary, advancePayload?.result ? [advancePayload.result] : []);
              }
              syncVisibleCoverageState({
                tone: 'accent',
                status: 'Paused',
                detail: `Saved progress for r/${sub}. Waiting for Reddit's cooldown window to expire before retrying.`,
                completedSubs,
                attemptedSubs: subsCount,
              });
              setFetchActivity({
                status: 'Waiting on cooldown',
                detail: `Saved progress for r/${sub} and waiting for Reddit's cooldown window to expire.`,
              });
              break;
            }

            authMode = authMode || advancePayload?.auth_mode || null;
            applyCoverage(advancePayload?.summary, advancePayload?.result ? [advancePayload.result] : []);
            rateLimitedSubs = rateLimitedSubs.filter((value) => value !== sub);
            if (!subs.some((candidate) => {
              const candidateState = coverageStates.get(String(candidate || '').toLowerCase());
              return Number(candidateState?.cooldown_until || 0) > Date.now();
            })) {
              pagedRetryAfterSeconds = 0;
            }
            if (!isCoverageComplete(coverageStates.get(subKey), goalCutoffUtc()) && effectiveMaxPages !== 0 && (pageCount + 1) >= effectiveMaxPages) {
              coverageStates.set(subKey, {
                ...(coverageStates.get(subKey) || {}),
                status: 'capped',
              });
            }
            const progressAfterAdvance = computeCoverageProgress({
              subs,
              coverageStates,
              coverageResults,
              effectiveMaxPages,
              goalCutoffUtc: goalCutoffUtc(),
            });
            syncVisibleCoverageState({
              tone: 'accent',
              status: 'Running',
              detail: `Checkpointing coverage for r/${sub}. ${progressAfterAdvance.completedSubs}/${subsCount} subreddits are already covered or capped. ${progressAfterAdvance.totalPosts} posts stored so far.`,
              completedSubs: progressAfterAdvance.completedSubs,
              attemptedSubs: subsCount,
            });
            setFetchActivity({
              status: `Stored r/${sub}`,
              detail: `${progressAfterAdvance.completedSubs}/${subsCount} subreddits complete or capped. ${progressAfterAdvance.totalPosts} post${progressAfterAdvance.totalPosts === 1 ? '' : 's'} stored so far.`,
            });

            await new Promise((resolve) => setTimeout(resolve, authMode === 'oauth' ? 2200 : 3200));
          }
        }

        if (!isCurrentCoverageRun()) return;
        const pagedResults = subs.map((sub) => {
          const subKey = String(sub || '').toLowerCase();
          const state = coverageStates.get(subKey);
          const result = coverageResults.get(subKey);
          return {
            subreddit: sub,
            meta: result?.state?.meta || result?.meta || state?.meta || null,
            posts: Array.isArray(result?.posts) ? result.posts : [],
            partial: isCoveragePageCapped(state, effectiveMaxPages, goalCutoffUtc()),
            coverage_state: state || null,
            error: state?.last_error || null,
          };
        });

        const activeCooldownSubs = subs.filter((sub) => {
          const state = coverageStates.get(String(sub || '').toLowerCase());
          return Number(state?.cooldown_until || 0) > Date.now();
        });
        const payload = {
          mode,
          time,
          days,
          limit: Math.min(25, limit),
          max_pages: maxPages,
          fetch_all_pages: maxPages === 0,
          auth_mode: authMode,
          results: pagedResults,
          fetched_at: Date.now(),
          request_capped: false,
          rate_limited: activeCooldownSubs.length > 0,
          rate_limited_subreddits: Array.from(new Set([
            ...rateLimitedSubs,
            ...activeCooldownSubs,
          ])),
          retry_after_seconds: pagedRetryAfterSeconds,
          timed_out: false,
          timed_out_subreddits: [],
          coverage_summary: buildCoverageCounts({ subs, coverageStates }),
          metrics: {
            subredditCount: pagedResults.length,
            totalPosts: pagedResults.reduce((sum, item) => sum + (item.posts?.length || 0), 0),
            rateLimitedCount: activeCooldownSubs.length,
            durationMs: Date.now() - pagedStartedAt,
            timedOutCount: 0,
          },
        };

        const retryAfterSeconds = Number(payload?.retry_after_seconds) || 0;
        if (payload.rate_limited && retryAfterSeconds > 0) {
          localPauseUntil = Date.now() + retryAfterSeconds * 1000;
          setRateLimitPauseUntil(localPauseUntil);
        } else {
          localPauseUntil = null;
          setRateLimitPauseUntil(null);
        }

        const perSub = buildPerSubFromCoverage();
        const authenticatedAfterFetch = payload?.auth_mode ? payload.auth_mode !== 'public' : authenticated;

        setNeedsAuth(false);
        setAuthenticated(authenticatedAfterFetch);
        setAuthChecking(false);
        setData(perSub);
        setFetchedAt(Number(payload?.fetched_at) || Date.now());
        setSnapshotInfo(null);
        setFetchSummary(buildFetchSummary(payload, perSub, {
          requestedFetchAllPages: maxPages === 0 || Boolean(payload?.fetch_all_pages),
          depthAutoCapped: false,
          effectiveMaxPages: maxPages,
          subsCount,
        }));
        const totalFetchedPosts = perSub.reduce((sum, group) => sum + ((group?.posts || []).length), 0);
        setFetchActivity({
          status: 'Fetch complete',
          detail: `Fetched ${totalFetchedPosts} post${totalFetchedPosts === 1 ? '' : 's'}. Starting opportunity ranking next.`,
        });

        if (authenticatedAfterFetch && !skipSyncForLargeBatch) {
          await syncDashboardSnapshot(perSub);
        }
        await runAiRanking({ perSub, triggeredByAuto, llmPostLimit: aiLlmPostLimit });

        const plan = getAutoRefreshPlan({
          autoRefreshEnabled,
          subsLength: subs.length,
          intervalMinutes: autoRefreshInterval,
          now: Date.now(),
          minMinutes: minAutoRefreshMinutes,
        });
        const pausedNext = localPauseUntil && localPauseUntil > Date.now() ? localPauseUntil : null;
        setNextRefreshAt(pausedNext || plan.nextRefreshAt);
        if (triggeredByAuto) {
          setLastAutoRefreshAt(Date.now());
        }
      } finally {
        setLoading(false);
        setFetchActivity(null);
        if (coverageAbortRef.current === controller) {
          coverageAbortRef.current = null;
        }
      }
    };

    void continueCoverageInBackground().catch((fetchError) => {
      if (coverageRunIdRef.current !== refreshRunId) return;
      setNeedsAuth(false);
      setSnapshotInfo(null);
      setFetchSummary(null);
      setFetchActivity({
        status: 'Failed',
        detail: fetchError?.message || 'Fetch failed before the checkpointed run completed.',
      });
      if (fetchError?.name === 'AbortError') {
        return;
      }
      setError(fetchError.message || 'Fetch failed - check your connection and try again');
    });

    return true;
  }

  globalScope.RDDRefreshController = {
    runAutoRefreshNotifications,
    runSnapshotRefreshFlow,
    startCoverageRefreshFlow,
  };
})(typeof window !== 'undefined' ? window : globalThis);
