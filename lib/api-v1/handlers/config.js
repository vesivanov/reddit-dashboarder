// Agent API v1 — Config Endpoint
// GET /api/v1/config — Get current monitoring configuration
// PATCH /api/v1/config — Update configuration (validated)

const { withCORS } = require('../../cors');
const {
  createSuccessResponse,
  createErrorResponse,
  ERROR_CODES,
} = require('../response-helpers');
const { validateSchema, CONFIG_SCHEMA, FILTERS_SCHEMA } = require('../validation');
const { parseRequest, getQueryValue } = require('../../request-utils');
const { verifyAgentApiKey } = require('../auth');
const { appendAuditEntry } = require('../../repos/agent-audit');
const {
  buildScopeId,
  compareAndSwapAgentConfig,
} = require('../../repos/agent-configs');
const { setActivePollerWorkspace } = require('../../repos/poller-runtime');
const { getOrMaterializeAgentContext } = require('../../services/agent-collab');
const { normalizeScoringConfig } = require('../../services/ai-ranking');

function buildConfigPayload(config) {
  return {
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
  };
}

function getExpectedVersion(req, body) {
  const headerValue = req.headers['if-match'];
  if (headerValue !== undefined) {
    const parsed = Number(headerValue);
    return Number.isInteger(parsed) ? parsed : null;
  }

  if (body?.version !== undefined) {
    return Number.isInteger(body.version) ? body.version : null;
  }

  return undefined;
}

async function parseBody(req, res) {
  if (req.body && typeof req.body === 'object') {
    return req.body;
  }

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
    const response = createErrorResponse(ERROR_CODES.VALIDATION_ERROR.code, 'Invalid JSON body');
    withCORS(req, res).status(400).json(response);
    return null;
  }
}

async function getHandler(req, res, token) {
  const startTime = Date.now();
  const authResult = verifyAgentApiKey(req);
  if (!authResult.valid) {
    const error = createErrorResponse(ERROR_CODES.UNAUTHORIZED.code, authResult.error);
    error.timings.totalMs = Date.now() - startTime;
    return withCORS(req, res).status(401).json(error);
  }

  const context = await getOrMaterializeAgentContext(token, { deriveConfigFromSync: true });
  if (!context.syncRecord && !context.config) {
    const error = createErrorResponse(
      ERROR_CODES.NOT_FOUND.code,
      'No configuration found',
      { message: 'Sync data not found. User must sync from frontend first.' }
    );
    error.timings.totalMs = Date.now() - startTime;
    return withCORS(req, res).status(404).json(error);
  }

  const response = createSuccessResponse({
    config: buildConfigPayload(context.config || {}),
  }, { totalMs: Date.now() - startTime });

  res.setHeader('ETag', String(context.config?.version ?? 0));
  return withCORS(req, res).status(200).json(response);
}

async function patchHandler(req, res, token) {
  const startTime = Date.now();
  const authResult = verifyAgentApiKey(req);
  if (!authResult.valid) {
    const error = createErrorResponse(ERROR_CODES.UNAUTHORIZED.code, authResult.error);
    error.timings.totalMs = Date.now() - startTime;
    return withCORS(req, res).status(401).json(error);
  }

  const body = await parseBody(req, res);
  if (res.finished) {
    return res;
  }

  const context = await getOrMaterializeAgentContext(token, { deriveConfigFromSync: true });
  if (!context.syncRecord && !context.config) {
    const error = createErrorResponse(ERROR_CODES.NOT_FOUND.code, 'No configuration found');
    error.timings.totalMs = Date.now() - startTime;
    return withCORS(req, res).status(404).json(error);
  }

  const expectedVersion = getExpectedVersion(req, body);
  const errors = [];
  const previous = {};
  const changedFields = [];
  const next = { ...(context.config || { scopeId: buildScopeId(token), version: 0 }) };

  if (expectedVersion === null) {
    errors.push({ field: 'version', message: 'If-Match header or body.version must be an integer' });
  } else if (expectedVersion !== undefined && expectedVersion !== (next.version ?? 0)) {
    const error = createErrorResponse(
      'VERSION_CONFLICT',
      'Configuration version conflict',
      [{ field: 'version', message: `Expected ${next.version ?? 0} but received ${expectedVersion}` }]
    );
    error.timings.totalMs = Date.now() - startTime;
    return withCORS(req, res).status(409).json(error);
  }

  if (body.subreddits !== undefined) {
    const error = CONFIG_SCHEMA.subreddits(body.subreddits, 'subreddits');
    if (error) errors.push(error);
    else {
      previous.subreddits = next.subreddits;
      next.subreddits = body.subreddits;
      changedFields.push('subreddits');
    }
  }

  if (body.filters !== undefined) {
    const filterErrors = validateSchema(body.filters, FILTERS_SCHEMA);
    if (filterErrors.length > 0) errors.push(...filterErrors);
    else {
      previous.filters = next.filters;
      next.filters = { ...(next.filters || {}), ...body.filters };
      changedFields.push('filters');
    }
  }

  if (body.goals !== undefined) {
    const error = CONFIG_SCHEMA.goals(body.goals, 'goals');
    if (error) errors.push(error);
    else {
      previous.goals = next.goals;
      next.goals = body.goals;
      changedFields.push('goals');
    }
  }

  if (body.aiContext !== undefined) {
    const error = CONFIG_SCHEMA.aiContext(body.aiContext, 'aiContext');
    if (error) errors.push(error);
    else {
      previous.aiContext = next.aiContext;
      next.aiContext = body.aiContext;
      changedFields.push('aiContext');
    }
  }

  if (body.aiPrompt !== undefined) {
    const error = CONFIG_SCHEMA.aiPrompt(body.aiPrompt, 'aiPrompt');
    if (error) errors.push(error);
    else {
      previous.aiPrompt = next.aiPrompt;
      next.aiPrompt = body.aiPrompt;
      changedFields.push('aiPrompt');
    }
  }

  if (body.opportunityConfig !== undefined) {
    const error = CONFIG_SCHEMA.opportunityConfig(body.opportunityConfig, 'opportunityConfig');
    if (error) errors.push(error);
    else {
      previous.opportunityConfig = next.opportunityConfig || null;
      next.opportunityConfig = {
        businessOffering: body.opportunityConfig?.businessOffering || '',
        idealCustomer: body.opportunityConfig?.idealCustomer || '',
        problemsSolved: body.opportunityConfig?.problemsSolved || '',
        preferredEngagement: body.opportunityConfig?.preferredEngagement || 'reply',
        strategyPreset: body.opportunityConfig?.strategyPreset || 'balanced',
        opportunityTypes: Array.isArray(body.opportunityConfig?.opportunityTypes) ? body.opportunityConfig.opportunityTypes : [],
        strictness: body.opportunityConfig?.strictness || 'balanced',
      };
      changedFields.push('opportunityConfig');
    }
  }

  if (body.scoringConfig !== undefined) {
    const error = CONFIG_SCHEMA.scoringConfig(body.scoringConfig, 'scoringConfig');
    if (error) errors.push(error);
    else {
      previous.scoringConfig = next.scoringConfig || null;
      next.scoringConfig = normalizeScoringConfig(body.scoringConfig);
      changedFields.push('scoringConfig');
    }
  }

  if (body.threshold !== undefined) {
    const error = CONFIG_SCHEMA.threshold(body.threshold, 'threshold');
    if (error) errors.push(error);
    else {
      previous.threshold = next.threshold;
      next.threshold = body.threshold;
      changedFields.push('threshold');
    }
  }

  if (body.model !== undefined) {
    const error = CONFIG_SCHEMA.model(body.model, 'model');
    if (error) errors.push(error);
    else {
      previous.model = next.model;
      next.model = body.model;
      changedFields.push('model');
    }
  }

  if (errors.length > 0) {
    const error = createErrorResponse(ERROR_CODES.VALIDATION_ERROR.code, 'Invalid configuration', errors);
    error.timings.totalMs = Date.now() - startTime;
    return withCORS(req, res).status(400).json(error);
  }

  const nowIso = new Date().toISOString();
  next.scopeId = next.scopeId || buildScopeId(token);
  next.sourceSyncToken = token;
  next.createdAt = next.createdAt || nowIso;
  next.updatedAt = nowIso;
  next.version = (next.version ?? 0) + 1;

  try {
    const casResult = await compareAndSwapAgentConfig(next.scopeId, context.config || null, next);
    if (!casResult.ok) {
      const currentVersion = casResult.current?.version ?? 0;
      const error = createErrorResponse(
        'VERSION_CONFLICT',
        'Configuration version conflict',
        [{ field: 'version', message: `Current stored version is ${currentVersion}` }]
      );
      error.timings.totalMs = Date.now() - startTime;
      return withCORS(req, res).status(409).json(error);
    }
  } catch (error) {
    if (String(error.message || '').startsWith('CAS_LOCK_TIMEOUT:')) {
      const response = createErrorResponse(
        'VERSION_CONFLICT',
        'Configuration update contention',
        [{ field: 'version', message: 'Could not acquire config update lock. Retry the request.' }]
      );
      response.timings.totalMs = Date.now() - startTime;
      return withCORS(req, res).status(409).json(response);
    }
    throw error;
  }

  await setActivePollerWorkspace(next.scopeId);

  const auditEntry = {
    id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    action: 'CONFIG_UPDATE',
    token: `${String(token).slice(0, 8)}...`,
    changedFields,
    previous,
    updatedAt: nowIso,
    version: next.version,
  };
  await appendAuditEntry(next.scopeId, auditEntry);

  const response = createSuccessResponse({
    config: buildConfigPayload(next),
    auditLog: {
      action: auditEntry.action,
      changedFields: auditEntry.changedFields,
      previous: auditEntry.previous,
      updatedAt: auditEntry.updatedAt,
      version: auditEntry.version,
    },
  }, { totalMs: Date.now() - startTime });

  res.setHeader('ETag', String(next.version));
  return withCORS(req, res).status(200).json(response);
}

async function handler(req, res) {
  const { query } = parseRequest(req);
  const token = getQueryValue(query, 'token', process.env.DIGEST_SYNC_TOKEN || '').trim();

  if (!token) {
    const error = createErrorResponse(ERROR_CODES.VALIDATION_ERROR.code, 'Missing token parameter');
    return withCORS(req, res).status(400).json(error);
  }

  if (req.method === 'OPTIONS') {
    return withCORS(req, res, 'GET, PATCH, OPTIONS').status(204).end();
  }

  if (req.method === 'GET') {
    return getHandler(req, res, token);
  }

  if (req.method === 'PATCH') {
    return patchHandler(req, res, token);
  }

  const error = createErrorResponse(ERROR_CODES.VALIDATION_ERROR.code, 'Method not allowed');
  return withCORS(req, res).status(405).json(error);
}

module.exports = handler;
