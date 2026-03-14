// Opportunity ranking API endpoint for Reddit posts
// Uses OpenRouter to analyze posts against the commercial opportunity brief
// Returns structured opportunity records plus legacy score proxies for compatibility

const { readSignedCookie } = require('../../cookies');
const { withCORS } = require('../../cors');
const {
  PROMPT_VERSION,
  buildBatches,
  normalizeScoringConfig,
  callOpenRouter,
  isFreeOpenRouterModel,
} = require('../../services/ai-ranking');
const {
  buildReviewPlan,
  buildHeuristicResult,
  buildAiItem,
} = require('../../services/ai-review');
const {
  createAiRankingRequestId,
  logAiRankingEvent,
  logAiRankingEvents,
} = require('../../services/ai-ranking-log');
const { runWithConcurrency } = require('../../services/reddit-fetch');
const { recordAiRankingMetric } = require('../../repos/ai-ranking-metrics');

const SERVER_OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// Model is required from frontend - no backend default to avoid duplication
// Frontend always provides openRouterModel in the request body

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function sanitizeText(value, maxLen = 400) {
  return String(value || '').trim().slice(0, maxLen);
}

function determineBatchConcurrency({ requestedModel, batchCount }) {
  const configured = Number(process.env.AI_RANK_BATCH_CONCURRENCY);
  if (Number.isFinite(configured) && configured > 0) {
    return Math.max(1, Math.min(4, Math.floor(configured), Math.max(1, batchCount || 1)));
  }
  if ((batchCount || 0) <= 1) return 1;
  return isFreeOpenRouterModel(requestedModel) ? 1 : Math.min(2, batchCount);
}

function classifyAiError(error) {
  const message = String(error?.message || '');
  if (message.includes('400')) return 'BAD_REQUEST';
  if (message.includes('401')) return 'INVALID_API_KEY';
  if (message.includes('429')) return 'RATE_LIMITED';
  if (/timeout|AbortError/i.test(message)) return 'TIMEOUT';
  if (/fetch|network/i.test(message)) return 'NETWORK_ERROR';
  return 'INTERNAL_ERROR';
}

function logAiRankingSummary(payload) {
  try {
    console.warn('[ai-ranking-summary]', JSON.stringify(payload));
  } catch (_error) {
    console.warn('[ai-ranking-summary]', payload);
  }
}

function normalizeAuditContext(auditContext) {
  const source = auditContext && typeof auditContext === 'object' ? auditContext : {};
  const chunkIndex = Number(source.chunkIndex);
  const totalChunks = Number(source.totalChunks);
  const totalFeedPosts = Number(source.totalFeedPosts);
  return {
    clientRunId: sanitizeText(source.clientRunId, 120) || null,
    chunkIndex: Number.isFinite(chunkIndex) ? Math.max(0, Math.floor(chunkIndex)) : null,
    totalChunks: Number.isFinite(totalChunks) ? Math.max(1, Math.floor(totalChunks)) : null,
    totalFeedPosts: Number.isFinite(totalFeedPosts) ? Math.max(0, Math.floor(totalFeedPosts)) : null,
  };
}

function buildAuditMeta({ requestId, auditContext = {}, requestedModel = null }) {
  return {
    requestId,
    requestedModel,
    clientRunId: auditContext.clientRunId || null,
    chunkIndex: auditContext.chunkIndex,
    totalChunks: auditContext.totalChunks,
    totalFeedPosts: auditContext.totalFeedPosts,
  };
}

function sanitizePostForLog(post = {}) {
  return {
    id: String(post.id || ''),
    title: String(post.title || ''),
    selftext: String(post.selftext || ''),
    subreddit: String(post.subreddit || ''),
    url: post.url || post.reddit_url || null,
    external_url: post.external_url || null,
    domain: post.domain || null,
    score: Number(post.score) || 0,
    num_comments: Number(post.num_comments) || 0,
    created_utc: Number(post.created_utc) || 0,
    link_flair_text: post.link_flair_text || null,
  };
}

function sanitizeHeuristicDetailsForLog(details = {}) {
  return {
    matchedTitle: Array.isArray(details.matchedTitle) ? details.matchedTitle.slice(0, 20) : [],
    matchedSelftext: Array.isArray(details.matchedSelftext) ? details.matchedSelftext.slice(0, 20) : [],
    matchedSubreddit: Array.isArray(details.matchedSubreddit) ? details.matchedSubreddit.slice(0, 20) : [],
    keywordScore: Number(details.keywordScore) || 0,
    keywordSignal: Number(details.keywordSignal) || 0,
    buyerIntentSignal: Number(details.buyerIntentSignal) || 0,
    authoritySignal: Number(details.authoritySignal) || 0,
    urgencySignal: Number(details.urgencySignal) || 0,
    painSignal: Number(details.painSignal) || 0,
    solutionSearchSignal: Number(details.solutionSearchSignal) || 0,
    freshnessScore: Number(details.freshnessScore) || 0,
    velocityScore: Number(details.velocityScore) || 0,
    engagementScore: Number(details.engagementScore) || 0,
    domainBonus: Number(details.domainBonus) || 0,
    ageHours: Number(details.ageHours) || 0,
    upvotesPerHour: Number(details.upvotesPerHour) || 0,
    commentsPerHour: Number(details.commentsPerHour) || 0,
  };
}

function sanitizeReviewPlanEntryForLog(entry, { plannedForLlm = false } = {}) {
  if (!entry) return null;
  return {
    plannedReview: plannedForLlm ? 'llm' : 'heuristic',
    heuristicScore: Number(entry.heuristicScore) || 0,
    opportunityScore: Number(entry.opportunityScore) || 0,
    freshnessRank: Number(entry.freshnessRank) || 0,
    velocityRank: Number(entry.velocityRank) || 0,
    lexicalRank: Number(entry.lexicalRank) || 0,
    heuristicDetails: sanitizeHeuristicDetailsForLog(entry.heuristicDetails),
  };
}

function sanitizeItemForLog(item, { planEntry = null } = {}) {
  return {
    postId: String(item?.postId || item?.post?.id || ''),
    score: item?.score ?? null,
    metadata: item?.metadata || null,
    review: item?.review || null,
    opportunity: item?.opportunity || null,
    reviewPlan: sanitizeReviewPlanEntryForLog(planEntry, {
      plannedForLlm: item?.review?.status === 'llm_reviewed',
    }),
  };
}

async function handler(req, res) {
  const isDev = process.env.NODE_ENV !== 'production';
  const startTime = Date.now();
  const requestId = createAiRankingRequestId();

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return withCORS(req, res, 'POST, OPTIONS').status(204).end();
  }

  if (req.method !== 'POST') {
    return withCORS(req, res, 'POST, OPTIONS').status(405).json({ error: 'Method not allowed' });
  }

  if (isDev) {
    console.log('=== AI Ranking API Request ===');
    console.log('Method:', req.method);
    console.log('URL:', req.url);
  }

  try {
    // Parse request body (works with both Express and Vercel)
    let body;
    if (req.body && typeof req.body === 'object') {
      // Already parsed by Express middleware
      body = req.body;
    } else {
      // Parse manually for Vercel/serverless
      try {
        body = await new Promise((resolve, reject) => {
          let data = '';
          req.on('data', chunk => { data += chunk; });
          req.on('end', () => {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              reject(e);
            }
          });
          req.on('error', reject);
        });
      } catch (parseError) {
        return withCORS(req, res, 'POST, OPTIONS').status(400).json({ error: 'Invalid JSON body' });
      }
    }

    const {
      posts,
      userGoals,
      userContext,
      scoringConfig,
      openRouterApiKey,
      openRouterModel,
      auditContext,
    } = body;

    if (isDev) {
      console.log('AI Ranking: Received request for', posts?.length || 0, 'posts');
      console.log('AI Ranking: User goals length:', userGoals?.length || 0);
      if (userContext) {
        console.log('AI Ranking: User context length:', userContext.length);
      }
      // Don't log whether API key is present - security concern
    }

    // Payload size limits for OpenRouter protection
    const MAX_POSTS_PER_REQUEST = 250;
    const MAX_BODY_SIZE_BYTES = 1024 * 1024; // 1MB

    // Rough body size check (for Vercel/serverless parsed bodies)
    const bodySize = JSON.stringify(body).length;
    if (bodySize > MAX_BODY_SIZE_BYTES) {
      return withCORS(req, res, 'POST, OPTIONS').status(413).json({
        error: 'Request too large',
        message: `Request body exceeds ${MAX_BODY_SIZE_BYTES / 1024}KB limit`
      });
    }

    if (!posts || !Array.isArray(posts)) {
      if (isDev) console.error('AI Ranking: Invalid posts array');
      return withCORS(req, res, 'POST, OPTIONS').status(400).json({ error: 'posts array is required' });
    }

    if (posts.length > MAX_POSTS_PER_REQUEST) {
      return withCORS(req, res, 'POST, OPTIONS').status(400).json({
        error: 'Too many posts',
        message: `Maximum ${MAX_POSTS_PER_REQUEST} posts per request. Received ${posts.length}.`
      });
    }

    if (!userGoals || typeof userGoals !== 'string' || !userGoals.trim()) {
      if (isDev) console.error('AI Ranking: Invalid user goals');
      return withCORS(req, res, 'POST, OPTIONS').status(400).json({ error: 'userGoals string is required' });
    }

    // Model is required - frontend always sends it
    const model = openRouterModel?.trim();
    if (!model) {
      if (isDev) console.error('AI Ranking: Model is required');
      return withCORS(req, res, 'POST, OPTIONS').status(400).json({
        error: 'Model is required',
        message: 'Please provide openRouterModel in the request body'
      });
    }
    // Keep scoring deterministic and easy to reason about.
    const normalizedTemperature = 0;
    const normalizedTopP = 1;

    // Priority: request body > HttpOnly cookie > server env variable
    // This allows migration from localStorage to secure cookie storage
    const cookieApiKey = readSignedCookie(req, 'openrouter_key');
    const apiKey = openRouterApiKey?.trim() || cookieApiKey || SERVER_OPENROUTER_API_KEY;

    if (!apiKey) {
      return withCORS(req, res, 'POST, OPTIONS').status(400).json({
        error: 'OpenRouter API key required',
        message: 'Please provide your OpenRouter API key in settings or configure OPENROUTER_API_KEY environment variable'
      });
    }

    if (posts.length === 0) {
      if (isDev) console.log('AI Ranking: No posts to rank');
      const emptyMetrics = {
        batchCount: 0,
        processedCount: 0,
        failedCount: 0,
        durationMs: Date.now() - startTime,
        promptVersion: PROMPT_VERSION,
        temperature: normalizedTemperature,
        topP: normalizedTopP,
      };
      try {
        res.setHeader('X-RDD-Metrics', JSON.stringify(emptyMetrics));
      } catch (setErr) {
        if (isDev) console.warn('Unable to set metrics header:', setErr.message);
      }
      return withCORS(req, res, 'POST, OPTIONS').status(200).json({
        items: [],
        scores: {},
        metadata: {},
        opportunities: {},
        model,
        temperature: normalizedTemperature,
        topP: normalizedTopP,
        metrics: emptyMetrics,
      });
    }

    const requestedLlmLimit = body.llmPostLimit === undefined || body.llmPostLimit === null
      ? posts.length
      : clampNumber(body.llmPostLimit, 0, MAX_POSTS_PER_REQUEST, posts.length);

    const allScores = {};
    const allMetadata = {};
    const allOpportunities = {};

    const normalizedGoals = userGoals.trim();
    const normalizedContext = typeof userContext === 'string' ? userContext.trim() : '';
    const normalizedScoringConfig = normalizeScoringConfig(scoringConfig);
    const normalizedAuditContext = normalizeAuditContext(auditContext);
    const auditMeta = buildAuditMeta({
      requestId,
      auditContext: normalizedAuditContext,
      requestedModel: model,
    });
    const reviewPlan = buildReviewPlan({
      posts,
      goalText: normalizedGoals,
      userContext: normalizedContext,
      llmLimit: requestedLlmLimit,
    });
    const llmEntries = reviewPlan.llmEntries || [];
    const llmPosts = llmEntries.map((entry) => entry.post);
    const batches = buildBatches(llmPosts);
    const batchConcurrency = determineBatchConcurrency({ requestedModel: model, batchCount: batches.length });
    logAiRankingEvent('request_started', {
      ...auditMeta,
      postCount: posts.length,
      bodySizeBytes: bodySize,
      scoringMode: 'hybrid',
      llmPostLimit: requestedLlmLimit,
      llmPlannedCount: llmPosts.length,
      heuristicPlannedCount: posts.length - llmPosts.length,
      batchCount: batches.length,
      batchConcurrency,
      promptVersion: PROMPT_VERSION,
    });
    logAiRankingEvent('request_context', {
      ...auditMeta,
      promptVersion: PROMPT_VERSION,
      scoringMode: 'hybrid',
      userGoals: normalizedGoals,
      userContext: normalizedContext || null,
      scoringConfig: normalizedScoringConfig,
      llmPostLimit: requestedLlmLimit,
      postCount: posts.length,
    });
    logAiRankingEvents('input_post', posts.map((post) => {
      const postId = String(post?.id || '');
      return {
        ...auditMeta,
        postId,
        post: sanitizePostForLog(post),
        reviewPlan: sanitizeReviewPlanEntryForLog(reviewPlan.entriesById.get(postId), {
          plannedForLlm: reviewPlan.llmPostIds.has(postId),
        }),
      };
    }));
    if (isDev) {
      console.log(`AI Ranking: Processing ${batches.length} batch(es) for ${llmPosts.length}/${posts.length} LLM-reviewed posts`);
    }

    const failedPostIds = [];
    const modelsUsed = new Set();
    const requestStrategiesTried = [];
    const requestStrategiesUsed = new Set();
    let fallbackUsed = false;
    let routingFallbackUsed = false;
    const batchResults = await runWithConcurrency(
      batches.map((batch, index) => async () => {
        const batchStartedAt = Date.now();
        try {
          if (isDev) console.log(`AI Ranking: Processing batch ${index + 1}/${batches.length} (${batch.length} posts)`);
          const result = await callOpenRouter({
            userGoals: normalizedGoals,
            userContext: normalizedContext,
            scoringConfig: normalizedScoringConfig,
            postsBatch: batch,
            apiKey,
            model,
            temperature: normalizedTemperature,
            topP: normalizedTopP,
          });
          return {
            index,
            batch,
            ok: true,
            result,
            durationMs: Date.now() - batchStartedAt,
          };
        } catch (error) {
          return {
            index,
            batch,
            ok: false,
            error,
            durationMs: Date.now() - batchStartedAt,
          };
        }
      }),
      {
        initialLimit: batchConcurrency,
        interTaskDelayMs: (index) => (batchConcurrency > 1 ? Math.min(250, index * 75) : 0),
      }
    );
    const batchDurationsMs = [];
    const batchSizes = [];
    let successfulBatchCount = 0;
    let failedBatchCount = 0;

    for (const batchResult of batchResults) {
      const batch = batchResult?.batch || [];
      batchSizes.push(batch.length);
      batchDurationsMs.push(Math.max(0, Number(batchResult?.durationMs) || 0));

      if (batchResult?.ok) {
        successfulBatchCount += 1;
        const result = batchResult.result;
        const batchScores = result.scores;
        const batchMetadata = result.metadata;
        const batchOpportunities = result.opportunities;
        if (result.modelUsed) {
          modelsUsed.add(result.modelUsed);
        }
        if (Array.isArray(result.requestStrategiesTried)) {
          requestStrategiesTried.push(...result.requestStrategiesTried);
        }
        if (result.requestStrategyUsed) {
          requestStrategiesUsed.add(result.requestStrategyUsed);
        }
        logAiRankingEvent('batch_completed', {
          ...auditMeta,
          batchIndex: (Number(batchResult?.index) || 0) + 1,
          batchSize: batch.length,
          requestedModel: model,
          resolvedModel: result.modelUsed || result.model || null,
          modelsUsed: result.modelUsed ? [result.modelUsed] : [],
          requestStrategyUsed: result.requestStrategyUsed || null,
          requestStrategiesTried: Array.isArray(result.requestStrategiesTried) ? result.requestStrategiesTried : [],
          fallbackUsed: Boolean(result.fallbackUsed),
          routingFallbackUsed: Boolean(result.routingFallbackUsed),
          durationMs: Math.max(0, Number(batchResult?.durationMs) || 0),
          postIds: batch.map((post) => String(post?.id || '')).filter(Boolean),
        });
        fallbackUsed = fallbackUsed || Boolean(result.fallbackUsed);
        routingFallbackUsed = routingFallbackUsed || Boolean(result.routingFallbackUsed);

        for (const [postId, score] of batchScores.entries()) {
          allScores[postId] = score;
          if (score === null) {
            failedPostIds.push(postId);
          }
        }

        for (const [postId, meta] of batchMetadata.entries()) {
          allMetadata[postId] = meta;
        }

        if (batchOpportunities && typeof batchOpportunities.entries === 'function') {
          for (const [postId, opportunity] of batchOpportunities.entries()) {
            if (opportunity) allOpportunities[postId] = opportunity;
          }
        }
      } else {
        failedBatchCount += 1;
        const batchError = batchResult?.error;
        if (isDev) {
          console.error(`AI Ranking: Error processing batch ${batchResult?.index + 1}:`, batchError);
        } else {
          const modelLabel = batchError?.modelTried ? ` model=${batchError.modelTried}` : '';
          const strategyLabel = batchError?.requestStrategy ? ` strategy=${batchError.requestStrategy}` : '';
          console.error(`AI Ranking: Batch ${batchResult?.index + 1} failed:${modelLabel}${strategyLabel}`, batchError?.message || 'Unknown error');
        }
        logAiRankingEvent('batch_failed', {
          ...auditMeta,
          batchIndex: (Number(batchResult?.index) || 0) + 1,
          batchSize: batch.length,
          modelTried: batchError?.modelTried || null,
          requestStrategy: batchError?.requestStrategy || null,
          errorCode: classifyAiError(batchError),
          errorMessage: batchError?.message || 'Unknown error',
          durationMs: Math.max(0, Number(batchResult?.durationMs) || 0),
          postIds: batch.map((post) => String(post?.id || '')).filter(Boolean),
        });
        batch.forEach((post) => {
          const postId = String(post.id);
          if (!(postId in allScores)) {
            failedPostIds.push(postId);
          }
        });
      }
    }

    const rankedAt = new Date().toISOString();
    const failedSet = new Set(failedPostIds);
    const items = [];

    for (const post of posts) {
      const postId = String(post.id);
      const plannedForLlm = reviewPlan.llmPostIds.has(postId);
      const llmScore = Object.prototype.hasOwnProperty.call(allScores, postId) ? allScores[postId] : undefined;
      const llmMetadata = allMetadata[postId] || null;
      const opportunity = allOpportunities[postId] || null;

      if (llmScore !== undefined && llmScore !== null) {
        const review = {
          status: 'llm_reviewed',
          source: 'llm',
          failed: false,
          rankedAt,
        };
        allMetadata[postId] = llmMetadata || {
          source: 'llm',
          confidence: 'medium',
          reason: 'LLM-ranked opportunity',
        };
        items.push(buildAiItem({
          post,
          score: llmScore,
          metadata: allMetadata[postId],
          opportunity,
          review,
        }));
        continue;
      }

      const planEntry = reviewPlan.entriesById.get(postId);
      const heuristicResult = buildHeuristicResult(planEntry, {
        failed: plannedForLlm || failedSet.has(postId),
        rankedAt,
      });
      allScores[postId] = heuristicResult.score;
      allMetadata[postId] = heuristicResult.metadata;
      if (heuristicResult.opportunity) {
        allOpportunities[postId] = heuristicResult.opportunity;
      }
      if (plannedForLlm || failedSet.has(postId)) {
        failedSet.add(postId);
      }
      items.push(buildAiItem({
        post,
        score: heuristicResult.score,
        metadata: heuristicResult.metadata,
        opportunity: heuristicResult.opportunity || null,
        review: heuristicResult.review,
      }));
    }

    const effectiveFailedPostIds = Array.from(failedSet);
    const processedCount = items.length;
    const llmReviewedCount = items.filter((item) => item.review?.status === 'llm_reviewed').length;
    const heuristicOnlyCount = items.filter((item) => item.review?.status === 'heuristic_only').length;
    const failedReviewCount = items.filter((item) => item.review?.status === 'failed').length;
    logAiRankingEvents('ranked_post', items.map((item) => {
      const postId = String(item?.postId || item?.post?.id || '');
      return {
        ...auditMeta,
        postId,
        item: sanitizeItemForLog(item, {
          planEntry: reviewPlan.entriesById.get(postId),
        }),
      };
    }));
    if (isDev) console.log(`AI Ranking: Complete! ${processedCount} items, ${failedReviewCount} AI fallback(s)`);

    const metrics = {
      batchCount: batches.length,
      successfulBatchCount,
      failedBatchCount,
      postCount: posts.length,
      processedCount,
      failedCount: effectiveFailedPostIds.length,
      llmReviewedCount,
      heuristicOnlyCount,
      failedReviewCount,
      durationMs: Date.now() - startTime,
      promptVersion: PROMPT_VERSION,
      scoringMode: 'hybrid',
      requestedModel: model,
      modelsUsed: Array.from(modelsUsed),
      fallbackUsed,
      routingFallbackUsed,
      requestStrategiesUsed: Array.from(requestStrategiesUsed),
      concurrency: batchConcurrency,
      temperature: normalizedTemperature,
      topP: normalizedTopP,
    };
    const metricRecord = {
      status: failedBatchCount > 0 ? (successfulBatchCount > 0 ? 'partial' : 'error') : 'success',
      requestedModel: model,
      resolvedModel: Array.from(modelsUsed)[0] || model,
      modelsUsed: Array.from(modelsUsed),
      fallbackUsed,
      routingFallbackUsed,
      freeModelRequested: isFreeOpenRouterModel(model),
      postCount: posts.length,
      processedCount,
      failedCount: effectiveFailedPostIds.length,
      batchCount: batches.length,
      successfulBatchCount,
      failedBatchCount,
      durationMs: metrics.durationMs,
      concurrency: batchConcurrency,
      bodySizeBytes: bodySize,
      batchSizes,
      batchDurationsMs,
      requestStrategiesTried: requestStrategiesTried.map((entry) => ({
        model: String(entry?.model || '').trim(),
        strategy: String(entry?.strategy || '').trim(),
      })).filter((entry) => entry.model && entry.strategy).slice(0, 20),
      requestStrategiesUsed: Array.from(requestStrategiesUsed),
      promptVersion: PROMPT_VERSION,
      errorCode: failedBatchCount > 0 ? 'BATCH_FAILURE' : null,
      errorMessage: failedBatchCount > 0 ? `${failedBatchCount} batch(es) failed` : null,
      llmReviewedCount,
      heuristicOnlyCount,
      failedReviewCount,
    };
    try {
      await recordAiRankingMetric(metricRecord);
    } catch (metricsError) {
      console.warn('[ai-ranking-summary] Unable to persist metrics:', metricsError.message);
    }
    logAiRankingEvent('request_completed', {
      ...auditMeta,
      status: metricRecord.status,
      resolvedModel: metricRecord.resolvedModel,
      modelsUsed: metricRecord.modelsUsed,
      postCount: posts.length,
      processedCount,
      failedCount: effectiveFailedPostIds.length,
      llmReviewedCount,
      heuristicOnlyCount,
      failedReviewCount,
      batchCount: batches.length,
      successfulBatchCount,
      failedBatchCount,
      fallbackUsed,
      routingFallbackUsed,
      requestStrategiesUsed: Array.from(requestStrategiesUsed),
      durationMs: metrics.durationMs,
      failedPostIds: effectiveFailedPostIds.slice(0, 50),
    });
    logAiRankingSummary(metricRecord);
    try {
      res.setHeader('X-RDD-Metrics', JSON.stringify(metrics));
    } catch (setErr) {
      if (isDev) console.warn('Unable to set metrics header:', setErr.message);
    }

    return withCORS(req, res, 'POST, OPTIONS').status(200).json({
      items,
      scores: allScores,
      metadata: allMetadata,
      opportunities: allOpportunities,
      model: Array.from(modelsUsed)[0] || model,
      requestedModel: model,
      modelsUsed: Array.from(modelsUsed),
      fallbackUsed,
      routingFallbackUsed,
      requestStrategiesUsed: Array.from(requestStrategiesUsed),
      temperature: normalizedTemperature,
      topP: normalizedTopP,
      promptVersion: PROMPT_VERSION,
      scoringMode: 'hybrid',
      processed: processedCount,
      metrics,
      ...(effectiveFailedPostIds.length > 0 && { failedPostIds: effectiveFailedPostIds }),
    });
  } catch (error) {
    const errorMetrics = {
      batchCount: 0,
      successfulBatchCount: 0,
      failedBatchCount: 0,
      postCount: 0,
      processedCount: 0,
      failedCount: 0,
      durationMs: Date.now() - startTime,
      promptVersion: PROMPT_VERSION,
      concurrency: 1,
      error: error.message,
    };
    try {
      await recordAiRankingMetric({
        status: 'error',
        requestedModel: 'unknown',
        resolvedModel: 'unknown',
        modelsUsed: [],
        fallbackUsed: false,
        freeModelRequested: false,
        postCount: 0,
        processedCount: 0,
        failedCount: 0,
        batchCount: 0,
        successfulBatchCount: 0,
        failedBatchCount: 0,
        durationMs: errorMetrics.durationMs,
        concurrency: 1,
        bodySizeBytes: 0,
        promptVersion: PROMPT_VERSION,
        errorCode: classifyAiError(error),
        errorMessage: error.message,
      });
    } catch (metricsError) {
      console.warn('[ai-ranking-summary] Unable to persist error metrics:', metricsError.message);
    }
    logAiRankingEvent('request_error', {
      requestId,
      status: 'error',
      errorCode: classifyAiError(error),
      errorMessage: error.message,
      durationMs: errorMetrics.durationMs,
    });
    logAiRankingSummary({
      status: 'error',
      errorCode: classifyAiError(error),
      errorMessage: error.message,
      durationMs: errorMetrics.durationMs,
    });
    try {
      res.setHeader('X-RDD-Metrics', JSON.stringify(errorMetrics));
    } catch (setErr) {
      if (isDev) console.warn('Unable to set AI metrics header on error:', setErr.message);
    }
    if (isDev) {
      console.error('AI ranking handler error:', error);
    } else {
      console.error('AI ranking error:', error.message);
    }

    // User-friendly error messages
    let statusCode = 500;
    let errorCode = 'INTERNAL_ERROR';
    let userMessage = 'An unexpected error occurred. Please try again.';

    if (error.message?.includes('timeout') || error.message?.includes('AbortError')) {
      statusCode = 504;
      errorCode = 'TIMEOUT';
      userMessage = 'The AI ranking request timed out. Try with fewer posts or a faster model.';
    } else if (error.message?.includes('401') || error.message?.includes('Unauthorized')) {
      statusCode = 401;
      errorCode = 'INVALID_API_KEY';
      userMessage = 'Your OpenRouter API key is invalid or expired. Please check your settings.';
    } else if (error.message?.includes('429') || error.message?.includes('rate limit')) {
      statusCode = 429;
      errorCode = 'RATE_LIMITED';
      userMessage = 'OpenRouter rate limit hit. Please wait a moment and try again.';
    } else if (error.message?.includes('fetch') || error.message?.includes('network')) {
      statusCode = 502;
      errorCode = 'NETWORK_ERROR';
      userMessage = 'Network error connecting to OpenRouter. Please check your connection.';
    }

    return withCORS(req, res, 'POST, OPTIONS').status(statusCode).json({
      error: errorCode,
      message: userMessage,
      details: isDev ? error.message : undefined,
    });
  }
}

module.exports = handler;
module.exports.buildBatches = buildBatches;
module.exports.callOpenRouter = callOpenRouter;
module.exports.PROMPT_VERSION = PROMPT_VERSION;
module.exports.normalizeScoringConfig = normalizeScoringConfig;
