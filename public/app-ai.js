(function initDashboardAiModule(globalScope) {
  const AI_SCORE_CACHE_KEY = 'dashboard_ai_scores_cache';
  const AI_CACHE_VERSION_KEY = 'dashboard_ai_cache_version';
  const AI_MODEL_KEY = 'dashboard_ai_model';
  const AI_PROMPT_VERSION_KEY = 'dashboard_ai_prompt_version';

  function buildAiCacheVersion({ goalText, contextText, promptVersion, model, hashGoals }) {
    const combinedGoals = `${String(goalText || '').trim()}||${String(contextText || '').trim()}`;
    const goalsHash = hashGoals(combinedGoals);
    return `${goalsHash}_${promptVersion}_${model}`;
  }

  function getAiCacheVersionStatus(currentVersion) {
    try {
      const savedVersion = localStorage.getItem(AI_CACHE_VERSION_KEY) || '';
      return {
        savedVersion,
        mismatched: Boolean(savedVersion && savedVersion !== currentVersion),
      };
    } catch {
      return { savedVersion: '', mismatched: false };
    }
  }

  function clearAiScoreCache() {
    try {
      localStorage.removeItem(AI_SCORE_CACHE_KEY);
    } catch {}
  }

  function ensureAiCacheVersion(currentVersion, { clearOnMismatch = false } = {}) {
    const status = getAiCacheVersionStatus(currentVersion);
    if (clearOnMismatch && status.mismatched) {
      clearAiScoreCache();
    }
    try {
      localStorage.setItem(AI_CACHE_VERSION_KEY, currentVersion);
    } catch {}
    return status;
  }

  function persistAiModelInfo({ model, promptVersion }) {
    try {
      if (model) localStorage.setItem(AI_MODEL_KEY, model);
      if (promptVersion) localStorage.setItem(AI_PROMPT_VERSION_KEY, promptVersion);
    } catch {}
  }

  function readAiScoreCacheObject() {
    try {
      const raw = localStorage.getItem(AI_SCORE_CACHE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  function loadAiScoreCache({
    posts = [],
    expiryMs,
    fallbackSource = 'llm',
    fallbackReason = 'Cached opportunity score',
  }) {
    const cache = readAiScoreCacheObject();
    const now = Date.now();
    const requestedIds = new Set((posts || []).map(post => String(post?.id || post?.data?.id || '')).filter(Boolean));
    const scores = new Map();
    const metadata = new Map();
    const opportunities = new Map();
    const validEntries = [];
    let hadExpiredRequestedEntries = false;

    Object.entries(cache).forEach(([postId, entry]) => {
      const isFresh = Boolean(
        entry?.timestamp
        && (now - entry.timestamp) < expiryMs
        && entry.score !== null
        && entry.score !== undefined
      );

      if (isFresh) {
        validEntries.push([postId, entry]);
      } else if (requestedIds.has(postId) && entry?.timestamp) {
        hadExpiredRequestedEntries = true;
      }

      if (!requestedIds.has(postId) || !isFresh) {
        return;
      }

      scores.set(postId, entry.score);
      if (entry.source || entry.confidence || entry.reason || entry.debug) {
        metadata.set(postId, {
          source: entry.source || fallbackSource,
          confidence: entry.confidence || 'medium',
          reason: entry.reason || fallbackReason,
          debug: entry.debug || null,
        });
      }
      if (entry.opportunity && typeof entry.opportunity === 'object') {
        opportunities.set(postId, entry.opportunity);
      }
    });

    if (validEntries.length < Object.keys(cache).length) {
      try {
        localStorage.setItem(AI_SCORE_CACHE_KEY, JSON.stringify(Object.fromEntries(validEntries)));
      } catch {}
    }

    return {
      scores,
      metadata,
      opportunities,
      cacheObject: Object.fromEntries(validEntries),
      hadExpiredRequestedEntries,
    };
  }

  function persistAiScoreCache(cacheObject, { maxEntries = 5000 } = {}) {
    try {
      const entries = Object.entries(cacheObject || {});
      if (entries.length > maxEntries) {
        entries.sort((a, b) => (a[1]?.timestamp || 0) - (b[1]?.timestamp || 0));
        localStorage.setItem(AI_SCORE_CACHE_KEY, JSON.stringify(Object.fromEntries(entries.slice(-maxEntries))));
      } else {
        localStorage.setItem(AI_SCORE_CACHE_KEY, JSON.stringify(cacheObject || {}));
      }
    } catch (error) {
      if (error?.name === 'QuotaExceededError') {
        clearAiScoreCache();
      }
    }
  }

  function buildHeuristicRankingPlan({
    posts = [],
    goalText = '',
    llmLimit = 0,
    extractGoalKeywords,
    computeHeuristicDetails,
    computeHeuristicScore,
  }) {
    const keywords = extractGoalKeywords(goalText.trim());
    const postsWithHeuristic = posts.map(post => {
      const details = computeHeuristicDetails
        ? computeHeuristicDetails(post, keywords)
        : {
            score: computeHeuristicScore(post, keywords),
            matchedTitle: [],
            matchedSelftext: [],
            matchedSubreddit: [],
            keywordScore: 0,
            engagementScore: 0,
            domainBonus: 0,
          };
      return {
        post,
        heuristicScore: details.score,
        heuristicDetails: details,
      };
    });

    postsWithHeuristic.sort((a, b) => b.heuristicScore - a.heuristicScore);
    const maxLlmPosts = Math.min(llmLimit, postsWithHeuristic.length);
    const topPosts = postsWithHeuristic.slice(0, maxLlmPosts).map(entry => entry.post);
    const remainingPosts = postsWithHeuristic.slice(maxLlmPosts);
    const heuristicDetailsById = new Map(
      postsWithHeuristic.map(entry => [String(entry.post.id), entry.heuristicDetails])
    );

    return {
      keywords,
      postsWithHeuristic,
      topPosts,
      remainingPosts,
      heuristicDetailsById,
    };
  }

  function buildAiRankRequestPayload({
    topPosts = [],
    goalText = '',
    contextText = '',
    avoidText = '',
    examples = {},
    secureKeyAvailable = false,
    openRouterApiKey = '',
    openRouterModel = '',
    modelTemperature = 0,
    modelTopP = 1,
  }) {
    return {
      posts: topPosts.map(post => ({
        id: post.id,
        title: post.title,
        selftext: post.selftext || '',
        subreddit: post.subreddit,
        url: post.reddit_url,
        external_url: post.external_url,
        domain: post.domain,
        score: post.score,
        num_comments: post.num_comments,
        created_utc: post.created_utc,
        link_flair_text: post.link_flair_text,
      })),
      userGoals: goalText.trim(),
      userContext: contextText && contextText.trim() ? contextText.trim() : undefined,
      scoringConfig: {
        lookingFor: goalText.trim(),
        avoid: avoidText && avoidText.trim() ? avoidText.trim() : undefined,
        examples: {
          perfect: examples.perfect && examples.perfect.trim() ? examples.perfect.trim() : undefined,
          strong: examples.strong && examples.strong.trim() ? examples.strong.trim() : undefined,
          reject: examples.reject && examples.reject.trim() ? examples.reject.trim() : undefined,
        },
      },
      openRouterApiKey: secureKeyAvailable ? undefined : (openRouterApiKey.trim() || undefined),
      openRouterModel: openRouterModel.trim(),
      modelTemperature,
      modelTopP,
    };
  }

  function collectStrongOpportunityNotifications({
    scores,
    opportunities,
    posts,
    notifiedIds,
    threshold = 4,
  }) {
    const idToPost = new Map((posts || []).map(post => [String(post.id), post]));
    const priorityThreshold = Number(threshold) / 5;
    const notifications = [];

    for (const [postId, score] of scores.entries()) {
      const opportunityPriority = Number(opportunities.get(postId)?.scores?.priority);
      const passesPriority = Number.isFinite(opportunityPriority) && opportunityPriority >= priorityThreshold;
      const passesLegacy = score != null && score >= threshold;
      if ((passesPriority || passesLegacy) && !notifiedIds.has(postId) && idToPost.has(postId)) {
        notifications.push({ postId, post: idToPost.get(postId) });
      }
    }

    return notifications;
  }

  function mergeAiRankResponse({
    result,
    scores,
    metadata,
    opportunities,
    cacheObject,
    heuristicDetailsById,
    scoredPostMap,
    buildRelevanceDebug,
    now = Date.now(),
  }) {
    const nextScores = new Map(scores);
    const nextMetadata = new Map(metadata);
    const nextOpportunities = new Map(opportunities);
    const nextCacheObject = { ...(cacheObject || {}) };
    const scoresObj = result?.scores || {};
    const metadataObj = result?.metadata || {};
    const opportunitiesObj = result?.opportunities || {};

    if (scoresObj && typeof scoresObj === 'object' && !Array.isArray(scoresObj)) {
      Object.entries(scoresObj).forEach(([postId, relevanceScore]) => {
        const postIdStr = String(postId);
        if (relevanceScore !== null && relevanceScore !== undefined) {
          nextScores.set(postIdStr, relevanceScore);
          const meta = metadataObj[postId] || {};
          const opportunity = opportunitiesObj[postId] || null;
          const heuristicDetails = heuristicDetailsById.get(postIdStr);
          nextMetadata.set(postIdStr, {
            source: 'llm',
            confidence: meta.confidence || 'medium',
            reason: meta.reason || 'LLM-ranked opportunity',
            debug: buildRelevanceDebug({
              postId: postIdStr,
              heuristicDetails,
              postMap: scoredPostMap,
              llmReason: meta.reason,
              llmConfidence: meta.confidence,
              source: 'llm',
            }),
          });
          if (opportunity) {
            nextOpportunities.set(postIdStr, opportunity);
          }
          nextCacheObject[postIdStr] = {
            score: relevanceScore,
            timestamp: now,
            version: result?.promptVersion || 'v3.1',
            model: result?.model || 'unknown',
            confidence: meta.confidence || 'medium',
            reason: meta.reason || 'LLM-ranked opportunity',
            source: 'llm',
            debug: nextMetadata.get(postIdStr)?.debug || null,
            opportunity: opportunity || null,
          };
        } else {
          nextScores.set(postIdStr, null);
        }
      });
    }

    return {
      scores: nextScores,
      metadata: nextMetadata,
      opportunities: nextOpportunities,
      cacheObject: nextCacheObject,
    };
  }

  function appendHeuristicScores({
    remainingPosts,
    scores,
    metadata,
    cacheObject,
    latestPromptVersion,
    latestModel,
    fallbackPromptVersion,
    fallbackModel,
    postMap,
    buildRelevanceDebug,
    now = Date.now(),
  }) {
    const nextScores = new Map(scores);
    const nextMetadata = new Map(metadata);
    const nextCacheObject = { ...(cacheObject || {}) };

    (remainingPosts || []).forEach(({ post, heuristicScore, heuristicDetails }) => {
      const postId = String(post.id);
      if (!nextScores.has(postId)) {
        const normalizedScore = Math.min(3, Math.round(heuristicScore * 0.3));
        nextScores.set(postId, normalizedScore);
        nextMetadata.set(postId, {
          source: 'heuristic',
          confidence: 'low',
          reason: 'Keyword-based opportunity',
          debug: buildRelevanceDebug({
            postId,
            heuristicDetails,
            postMap,
            source: 'heuristic',
          }),
        });
        nextCacheObject[postId] = {
          score: normalizedScore,
          timestamp: now,
          version: latestPromptVersion || fallbackPromptVersion,
          model: latestModel || fallbackModel,
          confidence: 'low',
          reason: 'Keyword-based opportunity',
          source: 'heuristic',
          debug: nextMetadata.get(postId)?.debug || null,
          opportunity: null,
        };
      }
    });

    return {
      scores: nextScores,
      metadata: nextMetadata,
      cacheObject: nextCacheObject,
    };
  }

  function appendNotifiedPostIds(previousIds, newIds, maxSize = 500) {
    const next = new Set(previousIds || []);
    (newIds || []).forEach(id => next.add(id));
    return next.size <= maxSize ? next : new Set([...next].slice(-maxSize));
  }

  globalScope.RDDAiClient = {
    AI_SCORE_CACHE_KEY,
    AI_CACHE_VERSION_KEY,
    AI_MODEL_KEY,
    AI_PROMPT_VERSION_KEY,
    buildAiCacheVersion,
    getAiCacheVersionStatus,
    clearAiScoreCache,
    ensureAiCacheVersion,
    persistAiModelInfo,
    readAiScoreCacheObject,
    loadAiScoreCache,
    persistAiScoreCache,
    buildHeuristicRankingPlan,
    buildAiRankRequestPayload,
    collectStrongOpportunityNotifications,
    mergeAiRankResponse,
    appendHeuristicScores,
    appendNotifiedPostIds,
  };
})(typeof window !== 'undefined' ? window : globalThis);
