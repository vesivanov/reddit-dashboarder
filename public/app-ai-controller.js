(function initDashboardAiController(globalScope) {
  const aiClient = globalScope.RDDAiClient || {};
  const fetchClient = globalScope.RDDFetchClient || {};

  const {
    buildAiCacheVersion = ({
      goalText,
      contextText,
      avoidText,
      examples,
      promptVersion,
      model,
      llmLimit,
      hashGoals,
    }) => `${hashGoals(JSON.stringify({ goalText, contextText, avoidText, examples, promptVersion, model, llmLimit }))}_${promptVersion}_${model}`,
    ensureAiCacheVersion = () => ({ savedVersion: '', mismatched: false }),
    persistAiModelInfo = () => {},
    loadAiScoreCache = () => ({ scores: new Map(), metadata: new Map(), opportunities: new Map(), items: new Map(), cacheObject: {} }),
    buildAiRankRequestPayload = (payload) => payload,
    collectStrongOpportunityNotifications = () => [],
    mergeAiRankResponse = ({ items, scores, metadata, opportunities, cacheObject }) => ({ items, scores, metadata, opportunities, cacheObject }),
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
    buildRelevanceDebug,
    setPostAiItems,
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
      setPostAiItems(new Map());
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
        avoidText: effectiveAvoidText,
        examples: {
          perfect: aiExamplePerfect,
          strong: aiExampleStrong,
          reject: aiExampleReject,
        },
        promptVersion: aiPromptVersion,
        model: openRouterModel,
        llmLimit: effectiveLlmLimit,
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
      const cachedItems = cacheState.items || new Map();
      const cachedScores = cacheState.scores;
      const cachedOpportunities = cacheState.opportunities;

      setAiActivity({
        status: 'Preparing',
        detail: `Preparing review for ${allNewPosts.length} post${allNewPosts.length === 1 ? '' : 's'}.`,
      });
      if (cachedScores.size > 0) {
        setPostAiItems(cachedItems);
        setScoresVersion((version) => version + 1);
      }

      const thisRequestId = ++opportunityScanRequestIdRef.current;
      setOpportunityScanError(null);
      setOpportunityScanLoading(true);
      setAiActivity({
        status: 'Analyzing',
        detail: `Reviewing ${allNewPosts.length} post${allNewPosts.length === 1 ? '' : 's'} for the best opportunities.`,
      });

      let scoresForNotifications = cachedScores;
      let opportunitiesForNotifications = cachedOpportunities;

      try {
        const aiRankResult = requestAiRank
          ? await requestAiRank(buildAiRankRequestPayload({
              posts: allNewPosts,
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
              llmPostLimit: effectiveLlmLimit,
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
          avoidText: effectiveAvoidText,
          examples: {
            perfect: aiExamplePerfect,
            strong: aiExampleStrong,
            reject: aiExampleReject,
          },
          promptVersion: latestPromptVersion,
          model: latestModel,
          llmLimit: effectiveLlmLimit,
          hashGoals,
        });
        if (updatedCacheVersion !== currentCacheVersion) {
          ensureAiCacheVersion(updatedCacheVersion, { clearOnMismatch: true });
        }

        const mergedAiState = mergeAiRankResponse({
          result,
          items: new Map(),
          scores: new Map(),
          metadata: new Map(),
          opportunities: new Map(),
          cacheObject: {},
        });

        aiClient.persistAiScoreCache(mergedAiState.cacheObject);

        if (opportunityScanRequestIdRef.current !== thisRequestId) {
          return;
        }

        setPostAiItems(mergedAiState.items);
        setScoresVersion((version) => version + 1);
        setAiScoresStale(false);

        const heuristicOnlyCount = Array.from(mergedAiState.items.values()).filter((item) => item.review?.status === 'heuristic_only').length;
        const failedReviewCount = Array.from(mergedAiState.items.values()).filter((item) => item.review?.status === 'failed').length;
        setAiActivity({
          status: failedReviewCount > 0 ? 'Ready with fallback' : 'Ready',
          detail: failedReviewCount > 0
            ? `Ready. ${failedReviewCount} post${failedReviewCount === 1 ? '' : 's'} fell back to lighter review.`
            : heuristicOnlyCount > 0
              ? 'Ready. Top matches received a full review and the rest use lighter review.'
              : 'Ready. Opportunities are sorted for this feed.',
        });

        scoresForNotifications = mergedAiState.scores;
        opportunitiesForNotifications = mergedAiState.opportunities;
      } catch (aiError) {
        console.error('Error in AI ranking batch processing:', aiError);
        if (opportunityScanRequestIdRef.current !== thisRequestId) {
          return;
        }
        setPostAiItems(cachedItems);
        setScoresVersion((version) => version + 1);
        setAiScoresStale(cachedScores.size > 0);
        setOpportunityScanError(aiError.message || 'Opportunity ranking failed.');
        setAiActivity({
          status: 'Failed',
          detail: cachedScores.size > 0
            ? 'Review failed, so cached results are still shown.'
            : 'Review failed before fresh results were ready.',
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
    } catch (aiError) {
      console.error('Error in AI ranking integration:', aiError);
      setOpportunityScanLoading(false);
      setAiActivity({
        status: 'Failed',
        detail: aiError.message || 'Review failed before results could be updated.',
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
