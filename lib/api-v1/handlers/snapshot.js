// Agent API v1 — Snapshot Endpoint
// GET /api/v1/snapshot
// Returns latest posts + config + analysis for AI agents

const { withCORS } = require('../../cors');
const {
  createSuccessResponse,
  createErrorResponse,
  ERROR_CODES,
} = require('../response-helpers');
const { parseRequest, getQueryValue } = require('../../request-utils');
const { verifyAgentApiKey } = require('../auth');
const { getOrMaterializeAgentContext } = require('../../services/agent-collab');

function normalizePost(post) {
  return {
    id: post.id,
    title: post.title,
    subreddit: post.subreddit,
    author: post.author,
    score: post.score,
    numComments: post.num_comments,
    createdUtc: post.created_utc,
    url: post.reddit_url || `https://reddit.com/r/${post.subreddit}/comments/${post.id}`,
    preview: (post.selftext || '').slice(0, 200),
    aiRelevance: post.aiRelevance ?? null,
    aiMetadata: post.aiMetadata || null,
    aiRankedAt: post.aiRankedAt || null,
  };
}

async function handler(req, res) {
  const startTime = Date.now();

  if (req.method === 'OPTIONS') {
    return withCORS(req, res).status(204).end();
  }

  if (req.method !== 'GET') {
    const error = createErrorResponse(ERROR_CODES.VALIDATION_ERROR.code, 'Method not allowed');
    error.timings.totalMs = Date.now() - startTime;
    return withCORS(req, res).status(405).json(error);
  }

  const authResult = verifyAgentApiKey(req);
  if (!authResult.valid) {
    const error = createErrorResponse(ERROR_CODES.UNAUTHORIZED.code, authResult.error);
    error.timings.totalMs = Date.now() - startTime;
    return withCORS(req, res).status(401).json(error);
  }

  const { query } = parseRequest(req);
  const token = getQueryValue(query, 'token', process.env.DIGEST_SYNC_TOKEN || '').trim();

  if (!token) {
    const error = createErrorResponse(
      ERROR_CODES.VALIDATION_ERROR.code,
      'Missing sync token',
      [{ field: 'token', message: 'Provide ?token=... or set DIGEST_SYNC_TOKEN env var' }]
    );
    error.timings.totalMs = Date.now() - startTime;
    return withCORS(req, res).status(400).json(error);
  }

  try {
    const context = await getOrMaterializeAgentContext(token);

    if (!context.syncRecord && !context.snapshot) {
      const error = createErrorResponse(
        ERROR_CODES.NOT_FOUND.code,
        'No snapshot available',
        { message: 'User has not synced data yet. Sync from the frontend first.' }
      );
      error.timings.totalMs = Date.now() - startTime;
      return withCORS(req, res).status(404).json(error);
    }

    const snapshot = context.snapshot;
    const config = context.config || {
      scopeId: context.scopeId,
      subreddits: [],
      filters: {},
      goals: '',
      aiPrompt: '',
      threshold: 3,
      model: '',
      version: 0,
      updatedAt: null,
    };
    const analysis = context.analysis || {
      status: 'not_started',
      source: 'none',
      jobId: null,
      hotLeads: [],
      hotLeadCount: 0,
      totalPosts: snapshot?.posts?.length || 0,
      completedAt: null,
      failedCount: 0,
    };

    const response = createSuccessResponse({
      snapshot: {
        id: snapshot.snapshotId,
        scopeId: snapshot.scopeId,
        sourceSyncToken: snapshot.sourceSyncToken,
        sourceSyncedAt: snapshot.sourceSyncedAt,
        createdAt: snapshot.createdAt,
        expiresAt: new Date(snapshot.expiresAt).toISOString(),
      },
      config: {
        subreddits: config.subreddits || [],
        filters: config.filters || {},
        goals: config.goals || '',
        aiContext: config.aiContext || '',
        aiPrompt: config.aiPrompt || '',
        scoringConfig: config.scoringConfig || null,
        threshold: config.threshold ?? 3,
        model: config.model || '',
        version: config.version ?? 0,
        updatedAt: config.updatedAt || null,
      },
      posts: (snapshot.posts || []).map(normalizePost),
      analysis,
    }, { totalMs: Date.now() - startTime });

    return withCORS(req, res).status(200).json(response);
  } catch (error) {
    console.error('[api-v1/snapshot] Error:', error);
    const response = createErrorResponse(
      ERROR_CODES.INTERNAL_ERROR.code,
      error.message || 'Internal server error'
    );
    response.timings.totalMs = Date.now() - startTime;
    return withCORS(req, res).status(500).json(response);
  }
}

module.exports = handler;
