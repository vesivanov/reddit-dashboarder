// /api/sync - Simple data sync between frontend and AI
// Frontend POSTs current state, AI can GET it anytime
//
// POST /api/sync - Store current frontend data
// GET /api/sync/:token - Retrieve stored data
// DELETE /api/sync/:token - Clear stored data
//
// Data expires after 24h (TTL handled by storage layer)

const { withCORS } = require('../cors');
const { readSignedCookie } = require('../cookies');
const storage = require('../storage');
const { identifySyncHotLeads } = require('../services/hot-leads');
const {
  DEFAULT_TTL_SECONDS,
  buildSyncRecord,
  refreshSyncRecord,
} = require('../services/sync-records');

const MAX_SYNC_PAYLOAD_BYTES = 190000;

function hasAuthenticatedSession(req) {
  return Boolean(readSignedCookie(req, 'access') || readSignedCookie(req, 'refresh'));
}

function hasInternalBearerAuth(req) {
  const authHeader = req.headers.authorization || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;

  const token = match[1].trim();
  return Boolean(
    (process.env.DIGEST_API_KEY && token === process.env.DIGEST_API_KEY) ||
    (process.env.AGENT_API_KEY && token === process.env.AGENT_API_KEY)
  );
}

function ensureAuthorized(req, res) {
  if (hasAuthenticatedSession(req) || hasInternalBearerAuth(req)) {
    return true;
  }

  withCORS(req, res, 'GET, POST, DELETE, OPTIONS').status(401).json({
    error: 'Unauthorized',
    message: 'Sync endpoints require an authenticated session or valid bearer token.',
  });
  return false;
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

// POST /api/sync - Store frontend data
async function postHandler(req, res) {
  if (!ensureAuthorized(req, res)) return;

  let body;
  if (req.body && typeof req.body === 'object') {
    body = req.body;
  } else {
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
      return withCORS(req, res).status(400).json({ error: 'Invalid JSON body' });
    }
  }

  const { token, posts, settings, filters, timestamp } = body;

  if (!token || typeof token !== 'string') {
    return withCORS(req, res).status(400).json({ 
      error: 'token is required',
      message: 'Provide a unique token to identify this sync session'
    });
  }

  // Store the data with TTL
  const now = Date.now();
  const data = buildSyncRecord({
    token,
    posts,
    settings,
    filters,
    timestamp,
    now,
  });

  const serializedSize = getSerializedSize(data);
  if (serializedSize > MAX_SYNC_PAYLOAD_BYTES) {
    return withCORS(req, res).status(413).json({
      error: 'Payload too large',
      message: 'Sync payload exceeds the size limit.',
      maxBytes: MAX_SYNC_PAYLOAD_BYTES,
      actualBytes: serializedSize,
    });
  }

  try {
    await storage.set(token, data, DEFAULT_TTL_SECONDS);
  } catch (error) {
    if (isPayloadTooLargeError(error)) {
      return withCORS(req, res).status(413).json({
        error: 'Payload too large',
        message: 'Sync payload exceeds the storage backend size limit.',
        maxBytes: MAX_SYNC_PAYLOAD_BYTES,
      });
    }
    return withCORS(req, res).status(503).json({
      error: 'Sync unavailable',
      message: 'Sync storage is temporarily unavailable.',
    });
  }

  return withCORS(req, res).status(200).json({
    success: true,
    token,
    postCount: (posts || []).length,
    expiresAt: new Date(now + (DEFAULT_TTL_SECONDS * 1000)).toISOString(),
  });
}

// GET /api/sync/:token - Retrieve stored data
async function getHandler(req, res, token) {
  if (!ensureAuthorized(req, res)) return;

  const data = await storage.get(token);

  if (!data) {
    return withCORS(req, res).status(404).json({
      error: 'Sync data not found',
      message: 'Token may have expired or data was never synced'
    });
  }

  // Identify top opportunities for downstream analysis
  const opportunities = identifySyncHotLeads(data.posts || [], data.settings || {});

  return withCORS(req, res).status(200).json({
    success: true,
    token: data.token,
    syncedAt: data.syncedAt,
    expiresAt: new Date(data.expiresAt).toISOString(),
    data: {
      posts: data.posts,
      settings: data.settings,
      filters: data.filters,
      timestamp: data.timestamp,
    },
    analysis: {
      opportunities,
      opportunityCount: opportunities.length,
      totalPosts: (data.posts || []).length,
    },
  });
}

// DELETE /api/sync/:token - Clear stored data
async function deleteHandler(req, res, token) {
  if (!ensureAuthorized(req, res)) return;

  const existed = await storage.get(token);
  if (existed) {
    await storage.delete(token);
  }

  return withCORS(req, res).status(200).json({
    success: true,
    deleted: !!existed,
  });
}

// Main router
async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return withCORS(req, res, 'GET, POST, DELETE, OPTIONS').status(204).end();
  }

  const url = req.url || '';
  const match = url.match(/^\/api\/sync(?:\/([\w-]+))?$/);

  if (!match) {
    return withCORS(req, res).status(404).json({ error: 'Not found' });
  }

  const token = match[1];

  try {
    if (!token) {
      // /api/sync
      if (req.method === 'POST') {
        return await postHandler(req, res);
      }
      return withCORS(req, res).status(405).json({ error: 'Method not allowed' });
    }

    // /api/sync/:token
    switch (req.method) {
      case 'GET':
        return await getHandler(req, res, token);
      case 'DELETE':
        return await deleteHandler(req, res, token);
      default:
        return withCORS(req, res).status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('[sync] Error:', error);
    return withCORS(req, res).status(500).json({
      error: 'Internal server error',
      message: error.message,
    });
  }
}

// Export handler and storage for Agent API v1
module.exports = handler;
module.exports.storage = storage;
module.exports.identifySyncHotLeads = identifySyncHotLeads;
module.exports.refreshSyncRecord = refreshSyncRecord;
module.exports.DEFAULT_TTL_SECONDS = DEFAULT_TTL_SECONDS;
