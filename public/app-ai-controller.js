(function initDashboardAiController(globalScope) {
  const aiClient = globalScope.RDDAiClient || {};
  const aiAuditClient = globalScope.RDDAiAuditClient || {};
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
  const {
    createAiAuditRunId = () => `airun_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    saveAiAuditRun = async () => null,
  } = aiAuditClient;
  const { requestAiRank = null } = fetchClient;
  const MAX_POSTS_PER_AI_REQUEST = 250;
  const FAST_FREE_MODEL = 'stepfun/step-3.5-flash:free';

  function selectAiModelForRun({ requestedModel, totalPostCount, llmPostLimit }) {
    const normalizedRequestedModel = String(requestedModel || '').trim();
    if (!normalizedRequestedModel.endsWith(':free') && normalizedRequestedModel !== 'openrouter/free') {
      return normalizedRequestedModel;
    }
    if (normalizedRequestedModel === FAST_FREE_MODEL) return normalizedRequestedModel;
    const normalizedPostCount = Math.max(0, Math.floor(Number(totalPostCount) || 0));
    const normalizedLlmLimit = Math.max(0, Math.floor(Number(llmPostLimit) || 0));
    if (normalizedPostCount >= 120 || normalizedLlmLimit >= 50) {
      return FAST_FREE_MODEL;
    }
    return normalizedRequestedModel;
  }

  function splitIntoChunks(items, chunkSize) {
    const normalizedChunkSize = Math.max(1, Math.floor(Number(chunkSize) || 1));
    const chunks = [];
    for (let index = 0; index < items.length; index += normalizedChunkSize) {
      chunks.push(items.slice(index, index + normalizedChunkSize));
    }
    return chunks;
  }

  function distributeLlmLimitAcrossChunks(chunkSizes, totalLimit) {
    const normalizedSizes = Array.isArray(chunkSizes)
      ? chunkSizes.map((size) => Math.max(0, Math.floor(Number(size) || 0)))
      : [];
    const totalPosts = normalizedSizes.reduce((sum, size) => sum + size, 0);
    const normalizedLimit = Math.max(0, Math.min(totalPosts, Math.floor(Number(totalLimit) || 0)));
    if (normalizedSizes.length === 0 || normalizedLimit === 0 || totalPosts === 0) {
      return normalizedSizes.map(() => 0);
    }

    const allocated = normalizedSizes.map((size) => Math.min(size, Math.floor((normalizedLimit * size) / totalPosts)));
    let remaining = normalizedLimit - allocated.reduce((sum, size) => sum + size, 0);
    const rankedIndexes = normalizedSizes
      .map((size, index) => ({ size, index }))
      .sort((left, right) => right.size - left.size);

    while (remaining > 0) {
      let assignedThisPass = false;
      for (const entry of rankedIndexes) {
        if (remaining <= 0) break;
        if (allocated[entry.index] >= normalizedSizes[entry.index]) continue;
        allocated[entry.index] += 1;
        remaining -= 1;
        assignedThisPass = true;
      }
      if (!assignedThisPass) break;
    }

    return allocated;
  }

  function buildAiRequestChunks(posts, llmPostLimit, maxPostsPerRequest = MAX_POSTS_PER_AI_REQUEST) {
    const chunks = splitIntoChunks(Array.isArray(posts) ? posts : [], maxPostsPerRequest);
    const llmLimits = distributeLlmLimitAcrossChunks(
      chunks.map((chunk) => chunk.length),
      llmPostLimit
    );
    return chunks.map((chunkPosts, index) => ({
      index,
      posts: chunkPosts,
      llmPostLimit: llmLimits[index] || 0,
      totalChunks: chunks.length,
    }));
  }

  function buildAuditSummary(items) {
    const values = Array.from((items || new Map()).values());
    return {
      totalItems: values.length,
      llmReviewedCount: values.filter((item) => item.review?.status === 'llm_reviewed').length,
      heuristicOnlyCount: values.filter((item) => item.review?.status === 'heuristic_only').length,
      failedReviewCount: values.filter((item) => item.review?.status === 'failed').length,
      topPriority: values
        .map((item) => Number(item?.opportunity?.scores?.priority))
        .filter((value) => Number.isFinite(value))
        .sort((left, right) => right - left)
        .slice(0, 10),
    };
  }

  function sanitizeChunkAudit(result, requestChunk) {
    return {
      chunkIndex: requestChunk.index,
      totalChunks: requestChunk.totalChunks,
      chunkPostCount: requestChunk.posts.length,
      llmPostLimit: requestChunk.llmPostLimit,
      requestedModel: result?.requestedModel || null,
      resolvedModel: result?.model || null,
      modelsUsed: Array.isArray(result?.modelsUsed) ? result.modelsUsed : [],
      requestStrategiesUsed: Array.isArray(result?.requestStrategiesUsed) ? result.requestStrategiesUsed : [],
      fallbackUsed: Boolean(result?.fallbackUsed),
      routingFallbackUsed: Boolean(result?.routingFallbackUsed),
      metrics: result?.metrics || null,
      failedPostIds: Array.isArray(result?.failedPostIds) ? result.failedPostIds : [],
      items: Array.isArray(result?.items) ? result.items : [],
    };
  }

  function logAiRankResponse({ requestChunk, aiRankResult }) {
    if (!aiRankResult) return;
    const detail = {
      chunkIndex: requestChunk?.index ?? null,
      totalChunks: requestChunk?.totalChunks ?? null,
      chunkPostCount: requestChunk?.posts?.length ?? null,
      llmPostLimit: requestChunk?.llmPostLimit ?? null,
      status: aiRankResult.status,
      ok: Boolean(aiRankResult.ok),
      model: aiRankResult.body?.model || null,
      requestedModel: aiRankResult.body?.requestedModel || null,
      metrics: aiRankResult.metrics || null,
      rate: aiRankResult.rateLimit || null,
      requestStrategiesUsed: Array.isArray(aiRankResult.body?.requestStrategiesUsed) ? aiRankResult.body.requestStrategiesUsed : [],
      fallbackUsed: Boolean(aiRankResult.body?.fallbackUsed),
      routingFallbackUsed: Boolean(aiRankResult.body?.routingFallbackUsed),
      failedPostIds: Array.isArray(aiRankResult.body?.failedPostIds) ? aiRankResult.body.failedPostIds : [],
      error: aiRankResult.ok ? null : (aiRankResult.body?.message || aiRankResult.body?.error || `HTTP ${aiRankResult.status}`),
    };
    const log = aiRankResult.ok ? console.info : console.warn;
    log('[ai-ranking-client]', detail);
  }

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
    const allNewPosts = groups.flatMap((group) => group.posts || []);
    let effectiveLlmLimit = Math.max(10, Math.min(maxLlmPostLimit, Number(llmPostLimit) || defaultLlmPostLimit));
    if (!triggeredByAuto && allNewPosts.length > 0) {
      const desiredCoverage = allNewPosts.length <= 80
        ? allNewPosts.length
        : Math.ceil(allNewPosts.length * 0.75);
      effectiveLlmLimit = Math.max(effectiveLlmLimit, Math.min(maxLlmPostLimit, desiredCoverage));
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
        model: selectAiModelForRun({
          requestedModel: openRouterModel,
          totalPostCount: allNewPosts.length,
          llmPostLimit: effectiveLlmLimit,
        }),
        llmLimit: effectiveLlmLimit,
        hashGoals,
      });
      let latestPromptVersion = aiPromptVersion;
      let latestModel = selectAiModelForRun({
        requestedModel: openRouterModel,
        totalPostCount: allNewPosts.length,
        llmPostLimit: effectiveLlmLimit,
      });
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
      const auditRunId = createAiAuditRunId();
      const auditRecord = {
        runId: auditRunId,
        createdAt: Date.now(),
        status: 'running',
        requestedModel: openRouterModel,
        resolvedModels: [],
        totalFeedPosts: allNewPosts.length,
        chunkCount: 0,
        llmPostLimit: effectiveLlmLimit,
        promptVersion: aiPromptVersion,
        scoringMode: 'hybrid',
        goalText: effectiveGoalText,
        contextText: effectiveContextText,
        avoidText: effectiveAvoidText,
        examples: {
          perfect: aiExamplePerfect,
          strong: aiExampleStrong,
          reject: aiExampleReject,
        },
        posts: allNewPosts,
        chunks: [],
        items: [],
        events: [],
        summary: {},
        error: null,
      };

      try {
        const requestChunks = buildAiRequestChunks(allNewPosts, effectiveLlmLimit);
        const clientRunId = auditRunId;
        const modelForRun = selectAiModelForRun({
          requestedModel: openRouterModel,
          totalPostCount: allNewPosts.length,
          llmPostLimit: effectiveLlmLimit,
        });
        auditRecord.chunkCount = requestChunks.length;
        auditRecord.events.push({
          time: Date.now(),
          type: 'run_started',
          totalFeedPosts: allNewPosts.length,
          chunkCount: requestChunks.length,
          llmPostLimit: effectiveLlmLimit,
        });
        let mergedAiState = {
          items: new Map(),
          scores: new Map(),
          metadata: new Map(),
          opportunities: new Map(),
          cacheObject: {},
        };

        for (const requestChunk of requestChunks) {
          if (opportunityScanRequestIdRef.current !== thisRequestId) {
            return;
          }

          setAiActivity({
            status: 'Analyzing',
            detail: requestChunk.totalChunks > 1
              ? `Reviewing chunk ${requestChunk.index + 1}/${requestChunk.totalChunks} (${requestChunk.posts.length} posts).`
              : `Reviewing ${allNewPosts.length} post${allNewPosts.length === 1 ? '' : 's'} for the best opportunities.`,
          });
          auditRecord.events.push({
            time: Date.now(),
            type: 'chunk_started',
            chunkIndex: requestChunk.index,
            totalChunks: requestChunk.totalChunks,
            chunkPostCount: requestChunk.posts.length,
            llmPostLimit: requestChunk.llmPostLimit,
          });

          const aiRankResult = requestAiRank
            ? await requestAiRank(buildAiRankRequestPayload({
                posts: requestChunk.posts,
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
                openRouterModel: modelForRun,
                llmPostLimit: requestChunk.llmPostLimit,
                modelTemperature: aiFixedTemperature,
                modelTopP: aiFixedTopP,
                auditContext: {
                  clientRunId,
                  chunkIndex: requestChunk.index,
                  totalChunks: requestChunk.totalChunks,
                  totalFeedPosts: allNewPosts.length,
                },
              }))
            : { ok: false, status: 500, body: null, retryAfterSeconds: 0 };

          logAiRankResponse({ requestChunk, aiRankResult });

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
          auditRecord.chunks.push(sanitizeChunkAudit(result, requestChunk));
          auditRecord.events.push({
            time: Date.now(),
            type: 'chunk_completed',
            chunkIndex: requestChunk.index,
            totalChunks: requestChunk.totalChunks,
            chunkPostCount: requestChunk.posts.length,
            llmReviewedCount: Number(result?.metrics?.llmReviewedCount) || 0,
            heuristicOnlyCount: Number(result?.metrics?.heuristicOnlyCount) || 0,
            failedReviewCount: Number(result?.metrics?.failedReviewCount) || 0,
            durationMs: Number(result?.metrics?.durationMs) || 0,
          });
          latestPromptVersion = result.promptVersion || latestPromptVersion;
          latestModel = result.model || latestModel;
          persistAiModelInfo({
            model: result.model,
            promptVersion: result.promptVersion,
          });

          mergedAiState = mergeAiRankResponse({
            result,
            items: mergedAiState.items,
            scores: mergedAiState.scores,
            metadata: mergedAiState.metadata,
            opportunities: mergedAiState.opportunities,
            cacheObject: mergedAiState.cacheObject,
          });
        }

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

        aiClient.persistAiScoreCache(mergedAiState.cacheObject);

        if (opportunityScanRequestIdRef.current !== thisRequestId) {
          return;
        }

        const heuristicOnlyCount = Array.from(mergedAiState.items.values()).filter((item) => item.review?.status === 'heuristic_only').length;
        const failedReviewCount = Array.from(mergedAiState.items.values()).filter((item) => item.review?.status === 'failed').length;
        auditRecord.status = failedReviewCount > 0 ? 'partial' : 'success';
        auditRecord.resolvedModels = Array.from(new Set(
          auditRecord.chunks.flatMap((chunk) => Array.isArray(chunk.modelsUsed) && chunk.modelsUsed.length ? chunk.modelsUsed : [chunk.resolvedModel]).filter(Boolean)
        ));
        if (!auditRecord.resolvedModels.length && latestModel) {
          auditRecord.resolvedModels = [latestModel];
        }
        auditRecord.promptVersion = latestPromptVersion;
        auditRecord.items = Array.from(mergedAiState.items.values());
        auditRecord.summary = buildAuditSummary(mergedAiState.items);
        auditRecord.events.push({
          time: Date.now(),
          type: 'run_completed',
          status: auditRecord.status,
          summary: auditRecord.summary,
        });
        void saveAiAuditRun(auditRecord);

        setPostAiItems(mergedAiState.items);
        setScoresVersion((version) => version + 1);
        setAiScoresStale(false);

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
        auditRecord.status = 'error';
        auditRecord.error = aiError.message || 'Opportunity ranking failed.';
        auditRecord.items = Array.from(cachedItems.values());
        auditRecord.summary = buildAuditSummary(cachedItems);
        auditRecord.events.push({
          time: Date.now(),
          type: 'run_failed',
          error: auditRecord.error,
          summary: auditRecord.summary,
        });
        void saveAiAuditRun(auditRecord);
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
    buildAiRequestChunks,
    selectAiModelForRun,
    runAiRankingFlow,
  };
})(typeof window !== 'undefined' ? window : globalThis);
