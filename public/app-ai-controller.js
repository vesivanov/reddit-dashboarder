(function initDashboardAiController(globalScope) {
  const aiClient = globalScope.RDDAiClient || {};
  const fetchClient = globalScope.RDDFetchClient || {};

  const {
    buildAiCacheVersion = ({ goalText, contextText, promptVersion, model, hashGoals }) => `${hashGoals(`${goalText}||${contextText}`)}_${promptVersion}_${model}`,
    ensureAiCacheVersion = () => ({ savedVersion: '', mismatched: false }),
    persistAiModelInfo = () => {},
    loadAiScoreCache = () => ({ scores: new Map(), metadata: new Map(), opportunities: new Map(), cacheObject: {} }),
    buildHeuristicRankingPlan = ({ posts = [] }) => ({ topPosts: posts, remainingPosts: [], heuristicDetailsById: new Map() }),
    buildAiRankRequestPayload = (payload) => payload,
    collectStrongOpportunityNotifications = () => [],
    mergeAiRankResponse = ({ scores, metadata, opportunities, cacheObject }) => ({ scores, metadata, opportunities, cacheObject }),
    appendHeuristicScores = ({ scores, metadata, cacheObject }) => ({ scores, metadata, cacheObject }),
    appendNotifiedPostIds = (previousIds) => new Set(previousIds || []),
  } = aiClient;
  const { requestAiRank = null } = fetchClient;

  function maybeSendStrongOpportunityNotifications({
    triggeredByAuto,
    notificationsEnabled,
    notifyStrongOpportunities,
    scores,
    opportunities,
    posts,
    notifiedStrongOpportunityPostIds,
    priorityNotificationThreshold,
    setNotifiedStrongOpportunityPostIds,
  }) {
    if (
      !triggeredByAuto
      || !notificationsEnabled
      || !notifyStrongOpportunities
      || !scores
      || scores.size === 0
      || typeof Notification === 'undefined'
      || Notification.permission !== 'granted'
    ) {
      return;
    }

    const toNotify = collectStrongOpportunityNotifications({
      scores,
      opportunities,
      posts,
      notifiedIds: notifiedStrongOpportunityPostIds,
      threshold: Number(priorityNotificationThreshold) || 4,
    });

    toNotify.forEach(({ post }) => {
      new Notification('Strong opportunity found', { body: post.title, icon: '/favicon.ico' });
    });

    if (toNotify.length > 0) {
      const toAdd = toNotify.map(({ postId }) => postId);
      setNotifiedStrongOpportunityPostIds((previousIds) => {
        return appendNotifiedPostIds(previousIds, toAdd, 500);
      });
    }
  }

  async function runAiRankingFlow({
    perSub,
    data,
    triggeredByAuto = false,
    llmPostLimit,
    opportunityEngineEnabled,
    hasOpportunityGoals,
    maxLlmPostLimit,
    defaultLlmPostLimit,
    aiRateLimitPauseUntil,
    formatTimeUntil,
    effectiveGoalText,
    effectiveContextText,
    effectiveAvoidText,
    aiPromptVersion,
    openRouterModel,
    hashGoals,
    aiCacheExpiryMs,
    secureKeyAvailable,
    openRouterApiKey,
    aiFixedTemperature,
    aiFixedTopP,
    aiExamplePerfect,
    aiExampleStrong,
    aiExampleReject,
    extractGoalKeywords,
    computeHeuristicDetails,
    computeHeuristicScore,
    buildRelevanceDebug,
    setPostScoreProxies,
    setPostScoreMetadata,
    setPostOpportunities,
    setScoresVersion,
    setAiActivity,
    setOpportunityScanError,
    setOpportunityScanLoading,
    setAiRateLimitPauseUntil,
    setAiScoresStale,
    notificationsEnabled,
    notifyStrongOpportunities,
    priorityNotificationThreshold,
    notifiedStrongOpportunityPostIds,
    setNotifiedStrongOpportunityPostIds,
    opportunityScanRequestIdRef,
  }) {
    if (!opportunityEngineEnabled || !hasOpportunityGoals) {
      setPostScoreProxies(new Map());
      setPostScoreMetadata(new Map());
      setPostOpportunities(new Map());
      setScoresVersion((version) => version + 1);
      setAiActivity({
        status: 'Off',
        detail: 'Opportunity engine is disabled, so no ranking is running.',
      });
      return;
    }

    const groups = Array.isArray(perSub) ? perSub : data;
    let effectiveLlmLimit = Math.max(10, Math.min(maxLlmPostLimit, Number(llmPostLimit) || defaultLlmPostLimit));
    if (groups.length >= 20) {
      effectiveLlmLimit = Math.min(effectiveLlmLimit, 40);
    } else if (groups.length >= 12) {
      effectiveLlmLimit = Math.min(effectiveLlmLimit, 60);
    }

    if (aiRateLimitPauseUntil && aiRateLimitPauseUntil > Date.now()) {
      const pauseLabel = formatTimeUntil(aiRateLimitPauseUntil);
      setAiActivity({
        status: 'Paused',
        detail: `Opportunity ranking is cooling down for ${pauseLabel}.`,
      });
      if (triggeredByAuto) {
        setOpportunityScanError(`Opportunity ranking cooling down for ${pauseLabel}.`);
      }
      return;
    }

    try {
      const currentCacheVersion = buildAiCacheVersion({
        goalText: effectiveGoalText,
        contextText: effectiveContextText,
        promptVersion: aiPromptVersion,
        model: openRouterModel,
        hashGoals,
      });
      let latestPromptVersion = aiPromptVersion;
      let latestModel = openRouterModel;
      const allNewPosts = groups.flatMap((group) => group.posts || []);

      ensureAiCacheVersion(currentCacheVersion, { clearOnMismatch: true });
      const cacheState = loadAiScoreCache({
        posts: allNewPosts,
        expiryMs: aiCacheExpiryMs,
      });
      const cachedScores = cacheState.scores;
      const cachedMetadata = cacheState.metadata;
      const cachedOpportunities = cacheState.opportunities;

      setAiActivity({
        status: 'Preparing',
        detail: `Checking cached scores for ${allNewPosts.length} post${allNewPosts.length === 1 ? '' : 's'}.`,
      });

      const uncachedPosts = allNewPosts.filter((post) => !cachedScores.has(String(post.id)));
      if (uncachedPosts.length > 0) {
        const thisRequestId = ++opportunityScanRequestIdRef.current;
        setOpportunityScanError(null);
        setOpportunityScanLoading(true);
        setAiActivity({
          status: 'Heuristic pass',
          detail: `Scoring ${uncachedPosts.length} uncached post${uncachedPosts.length === 1 ? '' : 's'} before the AI rerank.`,
        });

        const { postsWithHeuristic, topPosts, remainingPosts, heuristicDetailsById } = buildHeuristicRankingPlan({
          posts: uncachedPosts,
          goalText: effectiveGoalText,
          llmLimit: effectiveLlmLimit,
          extractGoalKeywords,
          computeHeuristicDetails,
          computeHeuristicScore,
        });

        setAiActivity({
          status: 'LLM rerank',
          detail: `Sending ${topPosts.length} high-priority post${topPosts.length === 1 ? '' : 's'} to ${openRouterModel.trim()} and keeping ${remainingPosts.length} as heuristic-only.`,
        });

        let scoresForNotifications = cachedScores;
        let opportunitiesForNotifications = cachedOpportunities;

        try {
          let allScores = new Map(cachedScores);
          let allMetadata = new Map(cachedMetadata);
          let allOpportunities = new Map(cachedOpportunities);
          let cacheObject = { ...(cacheState.cacheObject || {}) };

          const scoredPostMap = new Map(topPosts.map((post) => [String(post.id), post]));
          const aiRankResult = requestAiRank
            ? await requestAiRank(buildAiRankRequestPayload({
                topPosts,
                goalText: effectiveGoalText,
                contextText: effectiveContextText,
                avoidText: effectiveAvoidText,
                examples: {
                  perfect: aiExamplePerfect,
                  strong: aiExampleStrong,
                  reject: aiExampleReject,
                },
                secureKeyAvailable,
                openRouterApiKey,
                openRouterModel,
                modelTemperature: aiFixedTemperature,
                modelTopP: aiFixedTopP,
              }))
            : { ok: false, status: 500, body: null, retryAfterSeconds: 0 };

          if (!aiRankResult.ok) {
            const parsedError = aiRankResult.body;
            const retryAfterSeconds = aiRankResult.retryAfterSeconds || 0;
            if (aiRankResult.status === 429 && retryAfterSeconds > 0) {
              const pauseUntil = Date.now() + retryAfterSeconds * 1000;
              setAiRateLimitPauseUntil(pauseUntil);
              setOpportunityScanError(`Opportunity ranking rate-limited. Cooling down ~${retryAfterSeconds}s.`);
            }
            throw new Error(parsedError?.message || `AI ranking failed with HTTP ${aiRankResult.status}`);
          }

          setAiRateLimitPauseUntil(null);
          const result = aiRankResult.body;
          latestPromptVersion = result.promptVersion || aiPromptVersion;
          latestModel = result.model || openRouterModel;
          persistAiModelInfo({
            model: result.model,
            promptVersion: result.promptVersion,
          });

          const updatedCacheVersion = buildAiCacheVersion({
            goalText: effectiveGoalText,
            contextText: effectiveContextText,
            promptVersion: latestPromptVersion,
            model: latestModel,
            hashGoals,
          });
          if (updatedCacheVersion !== currentCacheVersion) {
            ensureAiCacheVersion(updatedCacheVersion, { clearOnMismatch: true });
          }

          const mergedAiState = mergeAiRankResponse({
            result,
            scores: allScores,
            metadata: allMetadata,
            opportunities: allOpportunities,
            cacheObject,
            heuristicDetailsById,
            scoredPostMap,
            buildRelevanceDebug,
          });
          allScores = mergedAiState.scores;
          allMetadata = mergedAiState.metadata;
          allOpportunities = mergedAiState.opportunities;
          cacheObject = mergedAiState.cacheObject;

          const failedTopPosts = postsWithHeuristic.filter(({ post }) => {
            const postId = String(post.id);
            return topPosts.some((candidate) => String(candidate.id) === postId) && allScores.get(postId) == null;
          });

          const heuristicState = appendHeuristicScores({
            remainingPosts: [...remainingPosts, ...failedTopPosts],
            scores: allScores,
            metadata: allMetadata,
            cacheObject,
            latestPromptVersion,
            latestModel,
            fallbackPromptVersion: aiPromptVersion,
            fallbackModel: openRouterModel,
            postMap: new Map(allNewPosts.map((post) => [String(post.id), post])),
            buildRelevanceDebug,
          });
          allScores = heuristicState.scores;
          allMetadata = heuristicState.metadata;
          cacheObject = heuristicState.cacheObject;

          aiClient.persistAiScoreCache(cacheObject);

          if (opportunityScanRequestIdRef.current !== thisRequestId) {
            return;
          }

          setPostScoreProxies(allScores);
          setPostScoreMetadata(allMetadata);
          setPostOpportunities(allOpportunities);
          setScoresVersion((version) => version + 1);
          setAiScoresStale(false);
          setAiActivity({
            status: 'Complete',
            detail: `Ranked ${topPosts.length} post${topPosts.length === 1 ? '' : 's'} with AI${result?.fallbackUsed ? ' using a free-model fallback' : ''} and ${remainingPosts.length + failedTopPosts.length} heuristically.`,
          });

          scoresForNotifications = allScores;
          opportunitiesForNotifications = allOpportunities;
        } catch (aiError) {
          console.error('Error in AI ranking batch processing:', aiError);
          if (opportunityScanRequestIdRef.current !== thisRequestId) {
            return;
          }
          setPostScoreProxies(cachedScores);
          setPostScoreMetadata(cachedMetadata);
          setPostOpportunities(cachedOpportunities);
          setScoresVersion((version) => version + 1);
          setAiScoresStale(cachedScores.size > 0);
          setOpportunityScanError(aiError.message || 'Opportunity ranking failed.');
          setAiActivity({
            status: 'Fallback',
            detail: `AI ranking failed, so the app kept ${cachedScores.size} cached score${cachedScores.size === 1 ? '' : 's'}.`,
          });
          scoresForNotifications = cachedScores;
          opportunitiesForNotifications = cachedOpportunities;
        } finally {
          setOpportunityScanLoading(false);
        }

        maybeSendStrongOpportunityNotifications({
          triggeredByAuto,
          notificationsEnabled,
          notifyStrongOpportunities,
          scores: scoresForNotifications,
          opportunities: opportunitiesForNotifications,
          posts: allNewPosts,
          notifiedStrongOpportunityPostIds,
          priorityNotificationThreshold,
          setNotifiedStrongOpportunityPostIds,
        });
      } else {
        setPostScoreProxies(cachedScores);
        setPostScoreMetadata(cachedMetadata);
        setPostOpportunities(cachedOpportunities);
        setScoresVersion((version) => version + 1);
        setAiScoresStale(false);
        setAiActivity({
          status: 'Cached',
          detail: `Used ${cachedScores.size} cached score${cachedScores.size === 1 ? '' : 's'} without rerunning the model.`,
        });

        maybeSendStrongOpportunityNotifications({
          triggeredByAuto,
          notificationsEnabled,
          notifyStrongOpportunities,
          scores: cachedScores,
          opportunities: cachedOpportunities,
          posts: allNewPosts,
          notifiedStrongOpportunityPostIds,
          priorityNotificationThreshold,
          setNotifiedStrongOpportunityPostIds,
        });
      }
    } catch (aiError) {
      console.error('Error in AI ranking integration:', aiError);
      setOpportunityScanLoading(false);
      setAiActivity({
        status: 'Failed',
        detail: aiError.message || 'Opportunity ranking failed before results could be updated.',
      });
      setAiScoresStale(true);
      setOpportunityScanError(aiError.message || 'Opportunity ranking failed before results could be updated.');
      if (triggeredByAuto) {
        setOpportunityScanError('Opportunity ranking failed during auto-refresh - scores may be stale.');
      }
    }
  }

  globalScope.RDDAiController = {
    runAiRankingFlow,
  };
})(typeof window !== 'undefined' ? window : globalThis);
