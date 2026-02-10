// /api/sync - Simple data sync between frontend and AI
// Frontend POSTs current state, AI can GET it anytime
//
// POST /api/sync - Store current frontend data
// GET /api/sync/:token - Retrieve stored data
// DELETE /api/sync/:token - Clear stored data
//
// Data expires after 24h (TTL cleanup)

const { withCORS } = require('../cors');

// Simple in-memory store with TTL
// In production, use Redis or Vercel KV
const syncStore = new Map();
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Cleanup expired entries every hour
setInterval(() => {
  const now = Date.now();
  for (const [token, data] of syncStore.entries()) {
    if (data.expiresAt < now) {
      syncStore.delete(token);
    }
  }
}, 60 * 60 * 1000);

// POST /api/sync - Store frontend data
async function postHandler(req, res) {
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
  syncStore.set(token, {
    token,
    posts: posts || [],
    settings: settings || {},
    filters: filters || {},
    timestamp: timestamp || new Date().toISOString(),
    syncedAt: new Date(now).toISOString(),
    expiresAt: now + DEFAULT_TTL_MS,
  });

  return withCORS(req, res).status(200).json({
    success: true,
    token,
    postCount: (posts || []).length,
    expiresAt: new Date(now + DEFAULT_TTL_MS).toISOString(),
  });
}

// GET /api/sync/:token - Retrieve stored data
async function getHandler(req, res, token) {
  const data = syncStore.get(token);

  if (!data) {
    return withCORS(req, res).status(404).json({
      error: 'Sync data not found',
      message: 'Token may have expired or data was never synced'
    });
  }

  if (data.expiresAt < Date.now()) {
    syncStore.delete(token);
    return withCORS(req, res).status(410).json({
      error: 'Sync data expired',
      expiredAt: new Date(data.expiresAt).toISOString()
    });
  }

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
  });
}

// DELETE /api/sync/:token - Clear stored data
async function deleteHandler(req, res, token) {
  const existed = syncStore.has(token);
  if (existed) {
    syncStore.delete(token);
  }

  return withCORS(req, res).status(200).json({
    success: true,
    deleted: existed,
  });
}

// Main router
module.exports = async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return withCORS(req, res, 'GET, POST, DELETE, OPTIONS').status(204).end();
  }

  const url = req.url || '';
  const match = url.match(/^\/api\/sync(?:\/(\w+))?$/);

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
};
