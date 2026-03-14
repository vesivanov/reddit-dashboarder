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
const { parseJsonBody } = require('../../http/parse-json-body');
const { ensureSessionOrBearerAuthorized } = require('../../http/session-or-bearer-auth');
const { verifyAgentApiKey } = require('../auth');
const {
  getWorkspaceContext,
  upsertWorkspaceSnapshot,
} = require('../../services/workspace-service');
const MAX_SNAPSHOT_PAYLOAD_BYTES = 190000;

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
    aiScoreProxy: post.aiScoreProxy ?? null,
    aiMetadata: post.aiMetadata || null,
    aiOpportunity: post.aiOpportunity || null,
    aiPriority: post.aiPriority ?? null,
    aiReview: post.aiReview || null,
    aiRankedAt: post.aiRankedAt || null,
  };
}

function isWorkspaceRoute(req) {
  return Boolean(req.params?.workspaceId);
}

function getSerializedSize(value) {
  try {
    return Buffer.byteLength(JSON.stringify(value || {}), 'utf8');
  } catch (_error) {
    return Number.POSITIVE_INFINITY;
  }
}

function isPayloadTooLargeError(error) {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('too large')
    || message.includes('payload')
    || message.includes('max size')
    || error?.status === 413
    || error?.statusCode === 413;
}

function ensureAuthorized(req, res, startTime) {
  if (isWorkspaceRoute(req)) {
    return ensureSessionOrBearerAuthorized(req, res, {
      methods: 'GET, PUT, OPTIONS',
      message: 'Workspace snapshot routes require an authenticated session or valid bearer token.',
    });
  }

  const authResult = verifyAgentApiKey(req);
  if (authResult.valid) {
    return true;
  }

  const error = createErrorResponse(ERROR_CODES.UNAUTHORIZED.code, authResult.error);
  error.timings.totalMs = Date.now() - startTime;
  withCORS(req, res).status(401).json(error);
  return false;
}

async function putHandler(req, res, { workspaceId, token }) {
  const startTime = Date.now();
  if (!isWorkspaceRoute(req)) {
    const error = createErrorResponse(ERROR_CODES.VALIDATION_ERROR.code, 'Method not allowed');
    error.timings.totalMs = Date.now() - startTime;
    return withCORS(req, res).status(405).json(error);
  }

  if (!ensureAuthorized(req, res, startTime)) {
    return res;
  }

  let body;
  try {
    body = await parseJsonBody(req);
  } catch (_error) {
    const response = createErrorResponse(ERROR_CODES.VALIDATION_ERROR.code, 'Invalid JSON body');
    response.timings.totalMs = Date.now() - startTime;
    return withCORS(req, res).status(400).json(response);
  }

  const requestPayload = {
    token: String(body?.token || token || '').trim(),
    posts: Array.isArray(body?.posts) ? body.posts : [],
    settings: body?.settings || {},
    filters: body?.filters || {},
    timestamp: body?.timestamp || null,
    source: body?.source && typeof body.source === 'object' ? body.source : null,
  };

  const payloadSize = getSerializedSize(requestPayload);
  if (payloadSize > MAX_SNAPSHOT_PAYLOAD_BYTES) {
    const response = createErrorResponse(ERROR_CODES.VALIDATION_ERROR.code, 'Payload too large');
    response.error.message = 'Workspace snapshot payload exceeds the size limit.';
    response.error.details = [
      { field: 'payload', message: `Max ${MAX_SNAPSHOT_PAYLOAD_BYTES} bytes, received ${payloadSize}` },
    ];
    response.timings.totalMs = Date.now() - startTime;
    return withCORS(req, res).status(413).json(response);
  }

  let result;
  try {
    result = await upsertWorkspaceSnapshot({
      workspaceId,
      ...requestPayload,
      now: startTime,
    });
  } catch (error) {
    const isTooLarge = isPayloadTooLargeError(error);
    const isMissingSource = error?.status === 404;
    const response = isTooLarge
      ? createErrorResponse(ERROR_CODES.VALIDATION_ERROR.code, 'Payload too large')
      : isMissingSource
      ? createErrorResponse(ERROR_CODES.NOT_FOUND.code, 'Workspace snapshot source unavailable')
      : createErrorResponse(ERROR_CODES.INTERNAL_ERROR.code, 'Workspace snapshot unavailable');
    response.error.message = isTooLarge
      ? 'Workspace snapshot payload exceeds the storage backend size limit.'
      : isMissingSource
      ? 'Workspace snapshot source coverage is unavailable.'
      : 'Workspace snapshot storage is temporarily unavailable.';
    response.timings.totalMs = Date.now() - startTime;
    return withCORS(req, res).status(isTooLarge ? 413 : (isMissingSource ? 404 : 503)).json(response);
  }

  if (!result.workspaceId || !result.snapshot) {
    const response = createErrorResponse(ERROR_CODES.NOT_FOUND.code, 'Workspace snapshot could not be stored');
    response.timings.totalMs = Date.now() - startTime;
    return withCORS(req, res).status(404).json(response);
  }

  return withCORS(req, res).status(200).json({
    success: true,
    workspaceId: result.workspaceId,
    token: result.token || null,
    snapshotId: result.snapshot.snapshotId,
    source: result.source,
    sourceContext: requestPayload.source || null,
    postCount: Array.isArray(result.snapshot.posts) ? result.snapshot.posts.length : 0,
    syncedAt: result.snapshot.sourceSyncedAt,
    expiresAt: new Date(result.snapshot.expiresAt).toISOString(),
  });
}

async function handler(req, res) {
  const startTime = Date.now();

  if (req.method === 'OPTIONS') {
    const methods = isWorkspaceRoute(req) ? 'GET, PUT, OPTIONS' : 'GET, OPTIONS';
    return withCORS(req, res, methods).status(204).end();
  }

  if (req.method === 'PUT') {
    const { query } = parseRequest(req);
    const target = {
      workspaceId: req.params?.workspaceId || getQueryValue(query, 'workspace_id', '').trim(),
      token: getQueryValue(query, 'token', '').trim(),
    };
    return putHandler(req, res, target);
  }

  if (req.method !== 'GET') {
    const error = createErrorResponse(ERROR_CODES.VALIDATION_ERROR.code, 'Method not allowed');
    error.timings.totalMs = Date.now() - startTime;
    return withCORS(req, res).status(405).json(error);
  }

  if (!ensureAuthorized(req, res, startTime)) {
    return res;
  }

  const { query } = parseRequest(req);
  const workspaceId = req.params?.workspaceId || getQueryValue(query, 'workspace_id', '').trim();
  const token = getQueryValue(query, 'token', process.env.DIGEST_SYNC_TOKEN || '').trim();

  if (!workspaceId && !token) {
    const error = createErrorResponse(
      ERROR_CODES.VALIDATION_ERROR.code,
      'Missing workspace identifier',
      [{ field: 'token', message: 'Provide ?token=..., ?workspace_id=..., or a workspace route param' }]
    );
    error.timings.totalMs = Date.now() - startTime;
    return withCORS(req, res).status(400).json(error);
  }

  try {
    const context = await getWorkspaceContext({ workspaceId, token });

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
      scopeId: context.workspaceId,
      workspaceId: context.workspaceId,
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
      opportunities: [],
      opportunityCount: 0,
      totalPosts: snapshot?.posts?.length || 0,
      completedAt: null,
      failedCount: 0,
    };

    const response = createSuccessResponse({
      snapshot: {
        id: snapshot.snapshotId,
        scopeId: snapshot.scopeId,
        workspaceId: context.workspaceId,
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
        opportunityConfig: config.opportunityConfig || null,
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
