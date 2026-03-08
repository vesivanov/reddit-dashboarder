const { withCORS } = require('../../cors');
const { readSignedCookie } = require('../../cookies');
const storage = require('../../storage');
const { validateSchema, CONFIG_SCHEMA } = require('../../api-v1/validation');
const { getOrMaterializeAgentContext } = require('../../services/agent-collab');
const { saveAgentConfig } = require('../../repos/agent-configs');
const { appendAuditEntry } = require('../../repos/agent-audit');
const { setActivePollerWorkspace } = require('../../repos/poller-runtime');
const { normalizeScoringConfig } = require('../../services/ai-ranking');

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
  if (hasAuthenticatedSession(req) || hasInternalBearerAuth(req)) return true;
  withCORS(req, res, 'GET, POST, OPTIONS').status(401).json({
    error: 'Unauthorized',
    message: 'Opportunity config settings require an authenticated session or valid bearer token.',
  });
  return false;
}

function buildResponseConfig(config = {}) {
  return {
    subreddits: config.subreddits || [],
    goals: config.goals || '',
    aiContext: config.aiContext || '',
    aiPrompt: config.aiPrompt || '',
    opportunityConfig: config.opportunityConfig || null,
    scoringConfig: config.scoringConfig || null,
    threshold: config.threshold ?? 3,
    model: config.model || '',
    version: config.version ?? 0,
    updatedAt: config.updatedAt || null,
  };
}

async function parseBody(req, res) {
  if (req.body && typeof req.body === 'object') return req.body;
  try {
    return await new Promise((resolve, reject) => {
      let data = '';
      req.on('data', chunk => { data += chunk; });
      req.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (error) {
          reject(error);
        }
      });
      req.on('error', reject);
    });
  } catch (_error) {
    withCORS(req, res, 'GET, POST, OPTIONS').status(400).json({ error: 'Invalid JSON body' });
    return null;
  }
}

async function getHandler(req, res, token) {
  const context = await getOrMaterializeAgentContext(token, { deriveConfigFromSync: true });
  if (!context.config) {
    return withCORS(req, res, 'GET, POST, OPTIONS').status(404).json({
      error: 'No opportunity config found',
    });
  }
  return withCORS(req, res, 'GET, POST, OPTIONS').status(200).json({
    success: true,
    config: buildResponseConfig(context.config),
  });
}

async function postHandler(req, res) {
  const body = await parseBody(req, res);
  if (res.finished) return res;

  const token = String(body?.token || '').trim();
  if (!token) {
    return withCORS(req, res, 'GET, POST, OPTIONS').status(400).json({
      error: 'token is required',
    });
  }

  const syncRecord = await storage.get(token);
  const context = await getOrMaterializeAgentContext(token, { deriveConfigFromSync: true });
  if (!syncRecord && !context.config) {
    return withCORS(req, res, 'GET, POST, OPTIONS').status(404).json({
      error: 'Sync data not found',
      message: 'Sync dashboard data before saving server-owned opportunity config.',
    });
  }

  const partial = {};
  if (body.subreddits !== undefined) partial.subreddits = body.subreddits;
  if (body.goals !== undefined) partial.goals = body.goals;
  if (body.aiContext !== undefined) partial.aiContext = body.aiContext;
  if (body.aiPrompt !== undefined) partial.aiPrompt = body.aiPrompt;
  if (body.opportunityConfig !== undefined) partial.opportunityConfig = body.opportunityConfig;
  if (body.scoringConfig !== undefined) partial.scoringConfig = body.scoringConfig;
  if (body.threshold !== undefined) partial.threshold = body.threshold;
  if (body.model !== undefined) partial.model = body.model;

  const errors = validateSchema(partial, CONFIG_SCHEMA);
  if (errors.length > 0) {
    return withCORS(req, res, 'GET, POST, OPTIONS').status(400).json({
      error: 'Invalid configuration',
      details: errors,
    });
  }

  const nowIso = new Date().toISOString();
  const existing = context.config || {};
  const next = {
    ...existing,
    scopeId: context.scopeId,
    sourceSyncToken: token,
    subreddits: body.subreddits !== undefined ? body.subreddits : (existing.subreddits || syncRecord?.settings?.subreddits || []),
    goals: body.goals !== undefined ? body.goals : (existing.goals || ''),
    aiContext: body.aiContext !== undefined ? body.aiContext : (existing.aiContext || ''),
    aiPrompt: body.aiPrompt !== undefined ? body.aiPrompt : (existing.aiPrompt || ''),
    opportunityConfig: body.opportunityConfig !== undefined ? {
      businessOffering: body.opportunityConfig?.businessOffering || '',
      idealCustomer: body.opportunityConfig?.idealCustomer || '',
      problemsSolved: body.opportunityConfig?.problemsSolved || '',
      preferredEngagement: body.opportunityConfig?.preferredEngagement || 'reply',
      strategyPreset: body.opportunityConfig?.strategyPreset || 'balanced',
      opportunityTypes: Array.isArray(body.opportunityConfig?.opportunityTypes) ? body.opportunityConfig.opportunityTypes : [],
      strictness: body.opportunityConfig?.strictness || 'balanced',
    } : (existing.opportunityConfig || null),
    scoringConfig: body.scoringConfig !== undefined ? normalizeScoringConfig(body.scoringConfig) : (existing.scoringConfig || null),
    threshold: body.threshold !== undefined ? body.threshold : (existing.threshold ?? 3),
    model: body.model !== undefined ? body.model : (existing.model || ''),
    createdAt: existing.createdAt || nowIso,
    updatedAt: nowIso,
    version: (existing.version ?? 0) + 1,
  };

  await saveAgentConfig(context.scopeId, next);
  await setActivePollerWorkspace(context.scopeId);
  await appendAuditEntry(context.scopeId, {
    id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    action: 'OPPORTUNITY_CONFIG_SYNC',
    token: `${token.slice(0, 8)}...`,
    updatedAt: nowIso,
    version: next.version,
  });

  return withCORS(req, res, 'GET, POST, OPTIONS').status(200).json({
    success: true,
    config: buildResponseConfig(next),
  });
}

async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return withCORS(req, res, 'GET, POST, OPTIONS').status(204).end();
  }

  if (!ensureAuthorized(req, res)) return;

  if (req.method === 'GET') {
    const token = String(req.query?.token || '').trim();
    if (!token) {
      return withCORS(req, res, 'GET, POST, OPTIONS').status(400).json({ error: 'token is required' });
    }
    return getHandler(req, res, token);
  }

  if (req.method === 'POST') {
    return postHandler(req, res);
  }

  return withCORS(req, res, 'GET, POST, OPTIONS').status(405).json({ error: 'Method not allowed' });
}

module.exports = handler;
