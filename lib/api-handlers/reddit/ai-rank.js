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
    console.info('[ai-ranking-summary]', JSON.stringify(payload));
  } catch (_error) {
    console.info('[ai-ranking-summary]', payload);
  }
}

async function handler(req, res) {
  const isDev = process.env.NODE_ENV !== 'production';
  const startTime = Date.now();

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

    const { posts, userGoals, userContext, scoringConfig, openRouterApiKey, openRouterModel } = body;

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
      return withCORS(req, res, 'POST, OPTIONS').status(200).json({ scores: {}, model, temperature: normalizedTemperature, topP: normalizedTopP, metrics: emptyMetrics });
    }

    // Build adaptive batches for all posts (client-side localStorage handles caching)
    const allScores = {};
    const allMetadata = {};
    const allOpportunities = {};
    const batches = buildBatches(posts);
    if (isDev) console.log(`AI Ranking: Processing ${batches.length} batches (adaptive sizing)`);

    const normalizedGoals = userGoals.trim();
    const normalizedContext = typeof userContext === 'string' ? userContext.trim() : '';
    const normalizedScoringConfig = normalizeScoringConfig(scoringConfig);

    const failedPostIds = [];
    const modelsUsed = new Set();
    let fallbackUsed = false;
    const batchConcurrency = determineBatchConcurrency({ requestedModel: model, batchCount: batches.length });
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
        fallbackUsed = fallbackUsed || Boolean(result.fallbackUsed);

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
          console.error(`AI Ranking: Batch ${batchResult?.index + 1} failed:`, batchError?.message || 'Unknown error');
        }
        batch.forEach((post) => {
          const postId = String(post.id);
          if (!(postId in allScores)) {
            failedPostIds.push(postId);
          }
        });
      }
    }

    // Ensure all requested posts have entries (null for failed ones)
    for (const post of posts) {
      const postId = String(post.id);
      if (!(postId in allScores)) {
        allScores[postId] = null;
      }
    }

    const processedCount = Object.keys(allScores).length;
    if (isDev) console.log(`AI Ranking: Complete! ${processedCount} total scores, ${failedPostIds.length} failed`);

    const metrics = {
      batchCount: batches.length,
      successfulBatchCount,
      failedBatchCount,
      postCount: posts.length,
      processedCount,
      failedCount: failedPostIds.length,
      durationMs: Date.now() - startTime,
      promptVersion: PROMPT_VERSION,
      scoringMode: 'stable',
      requestedModel: model,
      modelsUsed: Array.from(modelsUsed),
      fallbackUsed,
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
      freeModelRequested: isFreeOpenRouterModel(model),
      postCount: posts.length,
      processedCount,
      failedCount: failedPostIds.length,
      batchCount: batches.length,
      successfulBatchCount,
      failedBatchCount,
      durationMs: metrics.durationMs,
      concurrency: batchConcurrency,
      bodySizeBytes: bodySize,
      batchSizes,
      batchDurationsMs,
      promptVersion: PROMPT_VERSION,
      errorCode: failedBatchCount > 0 ? 'BATCH_FAILURE' : null,
      errorMessage: failedBatchCount > 0 ? `${failedBatchCount} batch(es) failed` : null,
    };
    try {
      await recordAiRankingMetric(metricRecord);
    } catch (metricsError) {
      console.warn('[ai-ranking-summary] Unable to persist metrics:', metricsError.message);
    }
    logAiRankingSummary(metricRecord);
    try {
      res.setHeader('X-RDD-Metrics', JSON.stringify(metrics));
    } catch (setErr) {
      if (isDev) console.warn('Unable to set metrics header:', setErr.message);
    }

    return withCORS(req, res, 'POST, OPTIONS').status(200).json({
      scores: allScores,
      metadata: allMetadata,
      opportunities: allOpportunities,
      model: Array.from(modelsUsed)[0] || model,
      requestedModel: model,
      modelsUsed: Array.from(modelsUsed),
      fallbackUsed,
      temperature: normalizedTemperature,
      topP: normalizedTopP,
      promptVersion: PROMPT_VERSION,
      scoringMode: 'stable',
      processed: processedCount,
      metrics,
      ...(failedPostIds.length > 0 && { failedPostIds }),
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
