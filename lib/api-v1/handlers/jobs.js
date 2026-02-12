// Agent API v1 — Async Analysis Jobs
// POST /api/v1/analyze — Trigger async analysis → returns { jobId }
// GET /api/v1/jobs/:jobId — Check status/result

const { withCORS } = require('../../cors');
const { 
  createSuccessResponse, 
  createErrorResponse, 
  ERROR_CODES,
} = require('../response-helpers');

// Import sync store and OpenRouter caller
const { syncStore } = require('../../api-handlers/sync');
const { callOpenRouter, buildBatches } = require('../../api-handlers/reddit/ai-rank');

// In-memory job store (use Redis in production)
const jobStore = new Map();
const JOB_TTL_MS = 60 * 60 * 1000; // 1 hour TTL for completed jobs

// Cleanup completed jobs every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [jobId, job] of jobStore.entries()) {
    if (job.status === 'completed' || job.status === 'failed') {
      if (job.completedAt && (now - job.completedAt) > JOB_TTL_MS) {
        jobStore.delete(jobId);
      }
    }
  }
}, 10 * 60 * 1000);

/**
 * Verify API key
 */
function verifyApiKey(req) {
  const apiKey = process.env.AGENT_API_KEY;
  
  if (!apiKey) {
    return { valid: false, error: 'AGENT_API_KEY not configured' };
  }

  const authHeader = req.headers.authorization || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  
  if (!match) {
    return { valid: false, error: 'Missing Authorization header' };
  }

  if (match[1].trim() !== apiKey) {
    return { valid: false, error: 'Invalid API key' };
  }

  return { valid: true };
}

/**
 * Generate unique job ID
 */
function generateJobId() {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `job_${timestamp}_${random}`;
}

/**
 * Calculate cost estimate (rough approximation)
 */
function estimateCost(postCount, model) {
  // Rough estimates based on typical token usage
  // Input: ~200 tokens per post (title + preview + metadata)
  // Output: ~50 tokens per post (score JSON)
  
  const inputTokens = postCount * 200;
  const outputTokens = postCount * 50;
  
  // Pricing per 1M tokens (rough estimates)
  const pricing = {
    'google/gemini-2.5-flash': { input: 0.15, output: 0.60 },
    'google/gemini-2.0-flash': { input: 0.10, output: 0.40 },
    'anthropic/claude-3.5-sonnet': { input: 3.00, output: 15.00 },
    'openai/gpt-4o-mini': { input: 0.15, output: 0.60 },
    'openai/gpt-4o': { input: 2.50, output: 10.00 },
  };
  
  const modelPricing = pricing[model] || pricing['google/gemini-2.5-flash'];
  
  const inputCost = (inputTokens / 1_000_000) * modelPricing.input;
  const outputCost = (outputTokens / 1_000_000) * modelPricing.output;
  
  return {
    cents: Math.round((inputCost + outputCost) * 100),
    currency: 'USD',
    breakdown: {
      inputTokens,
      outputTokens,
      inputCost: Math.round(inputCost * 10000) / 10000,
      outputCost: Math.round(outputCost * 10000) / 10000,
    },
  };
}

/**
 * Run analysis job (async)
 */
async function runAnalysisJob(jobId, token, posts, settings) {
  const job = jobStore.get(jobId);
  if (!job) return;
  
  try {
    job.status = 'running';
    job.startedAt = Date.now();
    
    const apiKey = settings?.openRouterApiKey || process.env.OPENROUTER_API_KEY;
    const model = settings?.openRouterModel || 'google/gemini-2.5-flash';
    const userGoals = settings?.aiGoals || '';
    const userContext = settings?.aiContext || '';
    
    if (!apiKey) {
      throw new Error('No OpenRouter API key available');
    }
    
    // Build batches
    const batches = buildBatches(posts);
    const totalPosts = posts.length;
    let postsScored = 0;
    const allScores = {};
    const allMetadata = {};
    const failedPostIds = [];
    
    // Process batches
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      
      try {
        const result = await callOpenRouter({
          userGoals,
          userContext,
          postsBatch: batch,
          apiKey,
          model,
        });
        
        // Extract scores
        for (const [postId, score] of result.scores.entries()) {
          allScores[postId] = score;
          if (score === null) {
            failedPostIds.push(postId);
          }
        }
        
        // Extract metadata
        for (const [postId, meta] of result.metadata.entries()) {
          allMetadata[postId] = meta;
        }
        
        postsScored += batch.length;
        
        // Update progress
        job.progress = {
          postsScored,
          totalPosts,
          currentBatch: i + 1,
          totalBatches: batches.length,
        };
        
        // Small delay between batches
        if (i < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (batchError) {
        console.error(`[job ${jobId}] Batch ${i + 1} failed:`, batchError.message);
        batch.forEach(p => {
          const postId = String(p.id);
          if (!(postId in allScores)) {
            failedPostIds.push(postId);
          }
        });
      }
    }
    
    // Count hot leads (score >= 4)
    const hotLeadCount = Object.values(allScores).filter(s => s >= 4).length;
    
    // Calculate cost
    const costEstimate = estimateCost(postsScored, model);
    
    // Complete job
    job.status = 'completed';
    job.completedAt = Date.now();
    job.result = {
      postsScored,
      hotLeadCount,
      modelUsed: model,
      costEstimate,
      failedCount: failedPostIds.length,
      ...(failedPostIds.length > 0 && { failedPostIds }),
    };
    
    // Update snapshot with analysis reference
    const snapshotData = syncStore.get(token);
    if (snapshotData) {
      snapshotData.lastAnalysisJobId = jobId;
      snapshotData.lastAnalyzedAt = new Date().toISOString();
    }
    
  } catch (error) {
    console.error(`[job ${jobId}] Analysis failed:`, error);
    job.status = 'failed';
    job.completedAt = Date.now();
    job.error = {
      message: error.message,
      code: 'ANALYSIS_ERROR',
    };
  }
}

/**
 * POST handler - Trigger analysis
 */
async function postHandler(req, res) {
  const startTime = Date.now();
  
  const authResult = verifyApiKey(req);
  if (!authResult.valid) {
    return withCORS(req, res)
      .status(401)
      .json(createErrorResponse(ERROR_CODES.UNAUTHORIZED.code, authResult.error));
  }
  
  // Get token from query
  const url = new URL(req.url, `http://${req.headers.host}`);
  const token = url.searchParams.get('token') || process.env.DIGEST_SYNC_TOKEN;
  
  if (!token) {
    return withCORS(req, res)
      .status(400)
      .json(createErrorResponse(
        ERROR_CODES.VALIDATION_ERROR.code,
        'Missing token parameter'
      ));
  }
  
  // Get snapshot data
  const data = syncStore.get(token);
  if (!data) {
    return withCORS(req, res)
      .status(404)
      .json(createErrorResponse(
        ERROR_CODES.NOT_FOUND.code,
        'No snapshot available'
      ));
  }
  
  const posts = data.posts || [];
  if (posts.length === 0) {
    return withCORS(req, res)
      .status(400)
      .json(createErrorResponse(
        ERROR_CODES.VALIDATION_ERROR.code,
        'No posts to analyze'
      ));
  }
  
  // Create job
  const jobId = generateJobId();
  const estimatedDuration = Math.ceil(posts.length / 30) * 30; // ~30 seconds per 30-post batch
  
  const job = {
    id: jobId,
    status: 'queued',
    createdAt: Date.now(),
    token,
    estimatedDurationSeconds: estimatedDuration,
  };
  
  jobStore.set(jobId, job);
  
  // Start analysis asynchronously (don't await)
  runAnalysisJob(jobId, token, posts, data.settings);
  
  const totalMs = Date.now() - startTime;
  const response = createSuccessResponse({
    job: {
      id: jobId,
      status: 'queued',
      createdAt: new Date(job.createdAt).toISOString(),
      estimatedDurationSeconds: estimatedDuration,
    },
  }, { totalMs });
  
  return withCORS(req, res).status(202).json(response);
}

/**
 * GET handler - Check job status
 */
async function getHandler(req, res, jobId) {
  const startTime = Date.now();
  
  const authResult = verifyApiKey(req);
  if (!authResult.valid) {
    return withCORS(req, res)
      .status(401)
      .json(createErrorResponse(ERROR_CODES.UNAUTHORIZED.code, authResult.error));
  }
  
  const job = jobStore.get(jobId);
  
  if (!job) {
    return withCORS(req, res)
      .status(404)
      .json(createErrorResponse(
        ERROR_CODES.NOT_FOUND.code,
        'Job not found'
      ));
  }
  
  const jobResponse = {
    id: job.id,
    status: job.status,
    createdAt: new Date(job.createdAt).toISOString(),
  };
  
  if (job.status === 'running') {
    jobResponse.progress = job.progress;
    jobResponse.startedAt = new Date(job.startedAt).toISOString();
  }
  
  if (job.status === 'completed') {
    jobResponse.result = job.result;
    jobResponse.startedAt = new Date(job.startedAt).toISOString();
    jobResponse.completedAt = new Date(job.completedAt).toISOString();
  }
  
  if (job.status === 'failed') {
    jobResponse.error = job.error;
    jobResponse.startedAt = job.startedAt ? new Date(job.startedAt).toISOString() : null;
    jobResponse.completedAt = new Date(job.completedAt).toISOString();
  }
  
  const totalMs = Date.now() - startTime;
  const response = createSuccessResponse({ job: jobResponse }, { totalMs });
  
  return withCORS(req, res).status(200).json(response);
}

/**
 * Main router
 */
async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return withCORS(req, res, 'GET, POST, OPTIONS').status(204).end();
  }
  
  const url = req.url || '';
  
  // POST /api/v1/analyze
  if (req.method === 'POST' && url === '/api/v1/analyze') {
    return await postHandler(req, res);
  }
  
  // GET /api/v1/jobs/:jobId
  if (req.method === 'GET') {
    const match = url.match(/^\/api\/v1\/jobs\/(\w+)$/);
    if (match) {
      return await getHandler(req, res, match[1]);
    }
  }
  
  return withCORS(req, res)
    .status(405)
    .json(createErrorResponse(ERROR_CODES.VALIDATION_ERROR.code, 'Method not allowed'));
}

module.exports = handler;
