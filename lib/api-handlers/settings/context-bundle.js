// Enhanced Context Bundle API for Human-AI Collaboration
// Allows seamless sharing of dashboard state between human frontend and AI agents
//
// POST   /api/context-bundle       - Create a new context bundle (human shares with AI)
// GET    /api/context-bundle/:id   - Retrieve a context bundle (AI accesses human's context)
// PATCH  /api/context-bundle/:id   - Update specific fields (AI suggests changes)
// DELETE /api/context-bundle/:id   - Revoke a bundle
// POST   /api/context-bundle/:id/apply - Apply AI-suggested changes to human's session
//
// Features:
// - Time-limited share tokens (default: 24h)
// - Versioned for conflict resolution
// - Supports "intent" - natural language description of what user wants
// - Includes full working state: settings + filters + current results + hidden/selected posts
// - Human must approve AI-suggested changes before they apply

const { withCORS } = require('../cors');
const crypto = require('crypto');

// In-memory store (use Redis/Vercel KV in production)
// Structure: { [token]: { bundle, expiresAt, version, appliedAt } }
const bundleStore = new Map();

const DEFAULT_TTL_HOURS = 24;
const MAX_TTL_HOURS = 168; // 1 week
const MAX_BUNDLE_SIZE = 100000; // 100KB

// Cleanup expired bundles every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [token, data] of bundleStore.entries()) {
    if (data.expiresAt < now) {
      bundleStore.delete(token);
    }
  }
}, 5 * 60 * 1000);

function generateToken() {
  return crypto.randomBytes  ('hex');
}

function generateToken() {
  return crypto.randomBytes(16).toString('hex');
}

function validateBundle(bundle) {
  const errors = [];
  
  if (!bundle || typeof bundle !== 'object') {
    return { valid: false, errors: ['Bundle must be an object'] };
  }
  
  // Settings validation (if provided)
  if (bundle.settings) {
    const s = bundle.settings;
    if (s.subs && !Array.isArray(s.subs)) {
      errors.push('settings.subs must be an array');
    }
    if (s.aiLlmPostLimit && (s.aiLlmPostLimit < 10 || s.aiLlmPostLimit > 500)) {
      errors.push('settings.aiLlmPostLimit must be between 10 and 500');
    }
  }
  
  // Intent must be string if provided
  if (bundle.intent && typeof bundle.intent !== 'string') {
    errors.push('intent must be a string');
  }
  
  return { valid: errors.length === 0, errors };
}

function createBundle(payload) {
  const now = new Date().toISOString();
  
  return {
    version: 1,
    createdAt: now,
    updatedAt: now,
    
    // Human's stated intent - what they want to achieve
    intent: payload.intent || '',
    
    // Full settings snapshot
    settings: {
      subs: payload.settings?.subs || [],
      maxPages: payload.settings?.maxPages ?? 5,
      autoRefreshEnabled: payload.settings?.autoRefreshEnabled ?? false,
      autoRefreshInterval: payload.settings?.autoRefreshInterval ?? 10,
      notificationsEnabled: payload.settings?.notificationsEnabled ?? false,
      upvoteThreshold: payload.settings?.upvoteThreshold ?? 100,
      alertKeywords: payload.settings?.alertKeywords ?? '',
      notifyHighRelevance: payload.settings?.notifyHighRelevance ?? false,
      highRelevanceThreshold: payload.settings?.highRelevanceThreshold ?? 4,
      aiGoals: payload.settings?.aiGoals ?? '',
      aiContext: payload.settings?.aiContext ?? '',
      aiEnabled: payload.settings?.aiEnabled ?? false,
      openRouterModel: payload.settings?.openRouterModel ?? 'google/gemini-2.0-flash-exp:free',
      aiLlmPostLimit: payload.settings?.aiLlmPostLimit ?? 60,
    },
    
    // Current working state
    state: {
      // Active filters
      filters: {
        selectedSub: payload.state?.filters?.selectedSub ?? 'ALL',
        keyword: payload.state?.filters?.keyword ?? '',
        minUpvotes: payload.state?.filters?.minUpvotes ?? '',
        minComments: payload.state?.filters?.minComments ?? '',
        minAiRelevance: payload.state?.filters?.minAiRelevance ?? '',
        sortBy: payload.state?.filters?.sortBy ?? 'date',
        sortOrder: payload.state?.filters?.sortOrder ?? 'desc',
      },
      
      // Currently selected/highlighted posts
      selectedPostIds: payload.state?.selectedPostIds || [],
      
      // Posts user has hidden
      hiddenPostIds: payload.state?.hiddenPostIds || [],
      
      // High-priority posts that triggered notifications
      flaggedPostIds: payload.state?.flaggedPostIds || [],
    },
    
    // Last digest results (optional - can be large)
    digest: payload.digest || null,
    
    // Collaboration metadata
    collaboration: {
      // Human -> AI: what the human wants
      humanIntent: payload.collaboration?.humanIntent || payload.intent || '',
      
      // AI -> Human: AI's interpretation and plan
      aiInterpretation: payload.collaboration?.aiInterpretation || '',
      aiPlan: payload.collaboration?.aiPlan || '',
      
      // Pending changes suggested by AI (human must approve)
      pendingChanges: payload.collaboration?.pendingChanges || null,
      
      // History of changes
      changeHistory: payload.collaboration?.changeHistory || [],
    },
    
    // Metadata
    meta: {
      source: payload.meta?.source || 'human',
      userAgent: payload.meta?.userAgent || '',
      url: payload.meta?.url || '',
    },
  };
}

// POST /api/context-bundle - Create new bundle
async function createHandler(req, res) {
  if (req.method !== 'POST') {
    return withCORS(req, res).status(405).json({ error: 'Method not allowed' });
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
  
  const validation = validateBundle(body);
  if (!validation.valid) {
    return withCORS(req, res).status(400).json({ 
      error: 'Validation failed', 
      details: validation.errors 
    });
  }
  
  const ttlHours = Math.min(
    MAX_TTL_HOURS,
    Math.max(1, body.ttlHours || DEFAULT_TTL_HOURS)
  );
  
  const bundle = createBundle(body);
  const bundleJson = JSON.stringify(bundle);
  
  if (bundleJson.length > MAX_BUNDLE_SIZE) {
    return withCORS(req, res).status(400).json({
      error: 'Bundle too large',
      maxSize: MAX_BUNDLE_SIZE,
      actualSize: bundleJson.length,
      suggestion: 'Remove digest data or reduce post history'
    });
  }
  
  const token = generateToken();
  const expiresAt = Date.now() + (ttlHours * 60 * 60 * 1000);
  
  bundleStore.set(token, {
    bundle,
    expiresAt,
    version: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    appliedAt: null,
  });
  
  const shareUrl = `${req.headers.origin || ''}/api/context-bundle/${token}`;
  
  return withCORS(req, res).status(201).json({
    success: true,
    token,
    shareUrl,
    expiresAt: new Date(expiresAt).toISOString(),
    ttlHours,
    bundle: {
      version: bundle.version,
      createdAt: bundle.createdAt,
      intent: bundle.intent,
      settings: {
        subs: bundle.settings.subs,
        aiEnabled: bundle.settings.aiEnabled,
      },
    },
  });
}

// GET /api/context-bundle/:id - Retrieve bundle
async function getHandler(req, res, token) {
  if (req.method !== 'GET') {
    return withCORS(req, res).status(405).json({ error: 'Method not allowed' });
  }
  
  const data = bundleStore.get(token);
  if (!data) {
    return withCORS(req, res).status(404).json({ 
      error: 'Bundle not found',
      message: 'Token may have expired or been revoked'
    });
  }
  
  if (data.expiresAt < Date.now()) {
    bundleStore.delete(token);
    return withCORS(req, res).status(410).json({ 
      error: 'Bundle expired',
      expiredAt: new Date(data.expiresAt).toISOString()
    });
  }
  
  return withCORS(req, res).status(200).json({
    success: true,
    token,
    expiresAt: new Date(data.expiresAt).toISOString(),
    version: data.version,
    bundle: data.bundle,
  });
}

// PATCH /api/context-bundle/:id - Update bundle (AI suggests changes)
async function patchHandler(req, res, token) {
  if (req.method !== 'PATCH') {
    return withCORS(req, res).status(405).json({ error: 'Method not allowed' });
  }
  
  const data = bundleStore.get(token);
  if (!data || data.expiresAt < Date.now()) {
    return withCORS(req, res).status(404).json({ error: 'Bundle not found or expired' });
  }
  
  let body;
  if (req.body && typeof req.body === 'object') {
    body = req.body;
  } else {
    try {
      body = await new Promise((resolve, reject) => {
        let d = '';
        req.on('data', chunk => { d += chunk; });
        req.on('end', () => {
          try {
            resolve(JSON.parse(d));
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
  
  // Build pending changes from AI suggestion
  const pendingChanges = {
    suggestedAt: new Date().toISOString(),
    suggestedBy: body.suggestedBy || 'ai',
    reason: body.reason || '',
    changes: body.changes || {},
  };
  
  // Update bundle with AI's interpretation and pending changes
  data.bundle.updatedAt = new Date().toISOString();
  data.bundle.collaboration.aiInterpretation = body.aiInterpretation || data.bundle.collaboration.aiInterpretation;
  data.bundle.collaboration.aiPlan = body.aiPlan || data.bundle.collaboration.aiPlan;
  data.bundle.collaboration.pendingChanges = pendingChanges;
  
  // Add to history
  data.bundle.collaboration.changeHistory.push({
    timestamp: pendingChanges.suggestedAt,
    type: 'ai_suggestion',
    reason: pendingChanges.reason,
    changes: Object.keys(pendingChanges.changes),
  });
  
  data.version += 1;
  data.updatedAt = Date.now();
  
  return withCORS(req, res).status(200).json({
    success: true,
    token,
    version: data.version,
    pendingChanges: data.bundle.collaboration.pendingChanges,
    message: 'Changes suggested. Human must approve via POST /apply',
  });
}

// POST /api/context-bundle/:id/apply - Human approves and applies changes
async function applyHandler(req, res, token) {
  if (req.method !== 'POST') {
    return withCORS(req, res).status(405).json({ error: 'Method not allowed' });
  }
  
  const data = bundleStore.get(token);
  if (!data || data.expiresAt < Date.now()) {
    return withCORS(req, res).status(404).json({ error: 'Bundle not found or expired' });
  }
  
  let body = {};
  if (req.body && typeof req.body === 'object') {
    body = req.body;
  } else if (req.headers['content-type']?.includes('json')) {
    try {
      body = await new Promise((resolve, reject) => {
        let d = '';
        req.on('data', chunk => { d += chunk; });
        req.on('end', () => {
          try {
            resolve(JSON.parse(d));
          } catch (e) {
            reject(e);
          }
        });
        req.on('error', reject);
      });
    } catch (e) {
      // Ignore parse errors for empty body
    }
  }
  
  const { approved, selectedChanges } = body;
  
  if (!approved) {
    // Reject pending changes
    data.bundle.collaboration.pendingChanges = null;
    data.bundle.collaboration.changeHistory.push({
      timestamp: new Date().toISOString(),
      type: 'human_rejection',
      reason: body.reason || 'Changes rejected by human',
    });
    
    return withCORS(req, res).status(200).json({
      success: true,
      message: 'Changes rejected',
    });
  }
  
  // Apply approved changes
  const pending = data.bundle.collaboration.pendingChanges;
  if (!pending) {
    return withCORS(req, res).status(400).json({ 
      error: 'No pending changes to apply' 
    });
  }
  
  const changesToApply = selectedChanges 
    ? Object.fromEntries(
        Object.entries(pending.changes).filter(([key]) => selectedChanges.includes(key))
      )
    : pending.changes;
  
  // Apply each change
  for (const [path, value] of Object.entries(changesToApply)) {
    const parts = path.split('.');
    let target = data.bundle;
    for (let i = 0; i < parts.length - 1; i++) {
      target = target[parts[i]];
    }
    target[parts[parts.length - 1]] = value;
  }
  
  data.bundle.updatedAt = new Date().toISOString();
  data.bundle.collaboration.pendingChanges = null;
  data.bundle.collaboration.changeHistory.push({
    timestamp: new Date().toISOString(),
    type: 'human_approval',
    reason: body.reason || 'Changes approved by human',
    changes: Object.keys(changesToApply),
  });
  
  data.appliedAt = Date.now();
  data.version += 1;
  
  return withCORS(req, res).status(200).json({
    success: true,
    appliedChanges: Object.keys(changesToApply),
    bundle: {
      settings: data.bundle.settings,
      state: data.bundle.state,
    },
  });
}

// DELETE /api/context-bundle/:id - Revoke bundle
async function deleteHandler(req, res, token) {
  if (req.method !== 'DELETE') {
    return withCORS(req, res).status(405).json({ error: 'Method not allowed' });
  }
  
  const existed = bundleStore.has(token);
  if (existed) {
    bundleStore.delete(token);
  }
  
  return withCORS(req, res).status(200).json({
    success: true,
    revoked: existed,
  });
}

// Main router
module.exports = async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return withCORS(req, res, 'GET, POST, PATCH, DELETE, OPTIONS').status(204).end();
  }
  
  const url = req.url || '';
  const match = url.match(/^\/api\/context-bundle(?:\/(\w+)(?:\/apply)?)?$/);
  
  if (!match) {
    return withCORS(req, res).status(404).json({ error: 'Not found' });
  }
  
  const token = match[1];
  const isApply = url.endsWith('/apply');
  
  try {
    if (!token) {
      // /api/context-bundle
      if (req.method === 'POST') {
        return await createHandler(req, res);
      }
      return withCORS(req, res).status(405).json({ error: 'Method not allowed' });
    }
    
    if (isApply) {
      // /api/context-bundle/:id/apply
      return await applyHandler(req, res, token);
    }
    
    // /api/context-bundle/:id
    switch (req.method) {
      case 'GET':
        return await getHandler(req, res, token);
      case 'PATCH':
        return await patchHandler(req, res, token);
      case 'DELETE':
        return await deleteHandler(req, res, token);
      default:
        return withCORS(req, res).status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('[context-bundle] Error:', error);
    return withCORS(req, res).status(500).json({
      error: 'Internal server error',
      message: error.message,
    });
  }
};
