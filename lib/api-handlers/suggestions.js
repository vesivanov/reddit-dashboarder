// AI Suggestion Queue API
// Enables async collaboration between AI agents and human users
//
// POST   /api/suggestions          - AI creates a suggestion
// GET    /api/suggestions          - Human fetches pending suggestions
// PATCH  /api/suggestions/:id      - Human applies or dismisses
// DELETE /api/suggestions/:id      - Remove a suggestion
//
// Features:
// - Anonymous by design (no auth required)
// - Uses simple token-based identification
// - Expires after 24h
// - Shows impact prediction

const { withCORS } = require('../cors');
const crypto = require('crypto');

// In-memory store (use Redis/Vercel KV in production)
// Structure: { [suggestionId]: { suggestion, userToken, createdAt, expiresAt, status } }
const suggestionStore = new Map();

const DEFAULT_TTL_HOURS = 24;
const MAX_SUGGESTIONS_PER_USER = 10;

// Cleanup expired suggestions every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, data] of suggestionStore.entries()) {
    if (data.expiresAt < now) {
      suggestionStore.delete(id);
    }
  }
}, 10 * 60 * 1000);

function generateId() {
  return crypto.randomBytes(12).toString('hex');
}

function getUserToken(req) {
  // Support multiple ways to identify user:
  // 1. Query param ?for=token
  // 2. Header X-User-Token
  // 3. Cookie user_token
  const queryToken = req.query?.for || req.query?.userToken;
  const headerToken = req.headers?.['x-user-token'];
  const cookieMatch = req.headers?.cookie?.match(/user_token=([^;]+)/);
  const cookieToken = cookieMatch ? cookieMatch[1] : null;
  
  return queryToken || headerToken || cookieToken || null;
}

function validateSuggestion(body) {
  const errors = [];
  
  if (!body || typeof body !== 'object') {
    return { valid: false, errors: ['Body must be an object'] };
  }
  
  if (!body.forUser || typeof body.forUser !== 'string') {
    errors.push('forUser (string) is required to identify who this suggestion is for');
  }
  
  if (!body.suggestion || typeof body.suggestion !== 'object') {
    errors.push('suggestion object is required');
  } else {
    const s = body.suggestion;
    if (!s.type || typeof s.type !== 'string') {
      errors.push('suggestion.type is required');
    }
    if (!s.changes || typeof s.changes !== 'object') {
      errors.push('suggestion.changes is required');
    }
    if (!s.reason || typeof s.reason !== 'string') {
      errors.push('suggestion.reason is required');
    }
  }
  
  return { valid: errors.length === 0, errors };
}

// POST /api/suggestions - AI creates a suggestion
async function createHandler(req, res) {
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
  
  const validation = validateSuggestion(body);
  if (!validation.valid) {
    return withCORS(req, res).status(400).json({
      error: 'Validation failed',
      details: validation.errors
    });
  }
  
  const userToken = body.forUser;
  
  // Count existing suggestions for this user
  const existingCount = Array.from(suggestionStore.values())
    .filter(s => s.userToken === userToken && s.status === 'pending')
    .length;
  
  if (existingCount >= MAX_SUGGESTIONS_PER_USER) {
    return withCORS(req, res).status(429).json({
      error: 'Too many pending suggestions',
      message: `User has ${existingCount} pending suggestions. Max is ${MAX_SUGGESTIONS_PER_USER}.`,
      existingCount
    });
  }
  
  const id = generateId();
  const ttlHours = Math.min(48, Math.max(1, body.ttlHours || DEFAULT_TTL_HOURS));
  const now = Date.now();
  
  const suggestion = {
    id,
    userToken,
    status: 'pending',
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + (ttlHours * 60 * 60 * 1000)).toISOString(),
    
    // The actual suggestion content
    type: body.suggestion.type,
    changes: body.suggestion.changes,
    reason: body.suggestion.reason,
    impact: body.suggestion.impact || null,
    confidence: body.suggestion.confidence || 'medium',
    
    // Context
    basedOn: body.basedOn || null,
    metadata: body.metadata || {},
    
    // Resolution tracking
    resolvedAt: null,
    resolvedBy: null,
    resolution: null,
  };
  
  suggestionStore.set(id, suggestion);
  
  return withCORS(req, res).status(201).json({
    success: true,
    suggestion: {
      id: suggestion.id,
      type: suggestion.type,
      reason: suggestion.reason,
      impact: suggestion.impact,
      confidence: suggestion.confidence,
      expiresAt: suggestion.expiresAt,
    },
  });
}

// GET /api/suggestions - Fetch pending suggestions for a user
async function listHandler(req, res) {
  const userToken = getUserToken(req);
  
  if (!userToken) {
    return withCORS(req, res).status(400).json({
      error: 'User token required',
      message: 'Provide via ?for=token, X-User-Token header, or user_token cookie'
    });
  }
  
  const now = Date.now();
  const suggestions = Array.from(suggestionStore.entries())
    .filter(([id, s]) => {
      return s.userToken === userToken && 
             s.status === 'pending' &&
             new Date(s.expiresAt).getTime() > now;
    })
    .map(([id, s]) => ({
      id: s.id,
      type: s.type,
      changes: s.changes,
      reason: s.reason,
      impact: s.impact,
      confidence: s.confidence,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      basedOn: s.basedOn,
    }));
  
  return withCORS(req, res).status(200).json({
    success: true,
    count: suggestions.length,
    suggestions,
  });
}

// PATCH /api/suggestions/:id - Apply or dismiss a suggestion
async function patchHandler(req, res, id) {
  const suggestion = suggestionStore.get(id);
  
  if (!suggestion) {
    return withCORS(req, res).status(404).json({
      error: 'Suggestion not found',
      message: 'Suggestion may have expired or been dismissed'
    });
  }
  
  if (suggestion.status !== 'pending') {
    return withCORS(req, res).status(409).json({
      error: 'Suggestion already resolved',
      status: suggestion.status,
      resolution: suggestion.resolution,
    });
  }
  
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
  
  const { action, reason } = body;
  
  if (!action || !['apply', 'dismiss'].includes(action)) {
    return withCORS(req, res).status(400).json({
      error: 'Invalid action',
      message: 'action must be "apply" or "dismiss"'
    });
  }
  
  const now = new Date().toISOString();
  suggestion.status = action === 'apply' ? 'applied' : 'dismissed';
  suggestion.resolvedAt = now;
  suggestion.resolution = reason || (action === 'apply' ? 'Applied by user' : 'Dismissed by user');
  
  return withCORS(req, res).status(200).json({
    success: true,
    action,
    suggestion: {
      id: suggestion.id,
      type: suggestion.type,
      changes: suggestion.changes,
      status: suggestion.status,
      resolvedAt: suggestion.resolvedAt,
    },
  });
}

// DELETE /api/suggestions/:id - Remove a suggestion
async function deleteHandler(req, res, id) {
  const existed = suggestionStore.has(id);
  if (existed) {
    suggestionStore.delete(id);
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
    return withCORS(req, res, 'GET, POST, PATCH, DELETE, OPTIONS').status(204).end();
  }
  
  const url = req.url || '';
  const match = url.match(/^\/api\/suggestions(?:\/(\w+))?$/);
  
  if (!match) {
    return withCORS(req, res).status(404).json({ error: 'Not found' });
  }
  
  const id = match[1];
  
  try {
    if (!id) {
      // /api/suggestions
      switch (req.method) {
        case 'POST':
          return await createHandler(req, res);
        case 'GET':
          return await listHandler(req, res);
        default:
          return withCORS(req, res).status(405).json({ error: 'Method not allowed' });
      }
    }
    
    // /api/suggestions/:id
    switch (req.method) {
      case 'PATCH':
        return await patchHandler(req, res, id);
      case 'DELETE':
        return await deleteHandler(req, res, id);
      default:
        return withCORS(req, res).status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('[suggestions] Error:', error);
    return withCORS(req, res).status(500).json({
      error: 'Internal server error',
      message: error.message,
    });
  }
};
