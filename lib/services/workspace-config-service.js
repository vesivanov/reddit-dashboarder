const { validateSchema, CONFIG_SCHEMA, FILTERS_SCHEMA } = require('../api-v1/validation');
const {
  compareAndSwapAgentConfig,
  saveAgentConfig,
} = require('../repos/agent-configs');
const { appendAuditEntry } = require('../repos/agent-audit');
const { getWorkspaceContext } = require('./workspace-service');
const { normalizeScoringConfig } = require('./ai-ranking');

function buildConfigPayload(config = {}, { includeFilters = true, includeWorkspaceId = true } = {}) {
  const payload = {
    ...(includeWorkspaceId ? { workspaceId: config.workspaceId || config.scopeId || null } : {}),
    subreddits: config.subreddits || [],
    ...(includeFilters ? { filters: config.filters || {} } : {}),
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

  return payload;
}

function buildLegacyConfigPayload(config = {}) {
  return buildConfigPayload(config, {
    includeFilters: false,
    includeWorkspaceId: false,
  });
}

function normalizeSubreddits(subreddits) {
  if (!Array.isArray(subreddits)) return subreddits;
  return subreddits
    .map((value) => String(value || '').trim().replace(/^r\//i, '').trim().toLowerCase())
    .filter(Boolean);
}

function normalizeOpportunityConfig(value) {
  if (value === undefined) return undefined;
  return {
    businessOffering: value?.businessOffering || '',
    idealCustomer: value?.idealCustomer || '',
    problemsSolved: value?.problemsSolved || '',
    preferredEngagement: value?.preferredEngagement || 'reply',
    strategyPreset: value?.strategyPreset || 'balanced',
    opportunityTypes: Array.isArray(value?.opportunityTypes) ? value.opportunityTypes : [],
    strictness: value?.strictness || 'balanced',
  };
}

async function getWorkspaceConfigState({
  workspaceId = null,
  token = '',
  now = Date.now(),
  deriveConfigFromSync = true,
} = {}) {
  return getWorkspaceContext({
    workspaceId,
    token,
    now,
    deriveConfigFromSync,
  });
}

async function updateWorkspaceConfig({
  workspaceId = null,
  token = '',
  body = {},
  expectedVersion = undefined,
  now = Date.now(),
  deriveConfigFromSync = true,
  persistMode = 'cas',
  auditAction = 'CONFIG_UPDATE',
  includeFilters = true,
} = {}) {
  const context = await getWorkspaceContext({
    workspaceId,
    token,
    now,
    deriveConfigFromSync,
  });

  if (!context.syncRecord && !context.config) {
    return { context, kind: 'not_found' };
  }

  const targetWorkspaceId = context.workspaceId;
  const errors = [];
  const previous = {};
  const changedFields = [];
  const next = {
    ...(context.config || {
      scopeId: targetWorkspaceId,
      workspaceId: targetWorkspaceId,
      version: 0,
    }),
  };

  if (expectedVersion === null) {
    errors.push({ field: 'version', message: 'If-Match header or body.version must be an integer' });
  } else if (expectedVersion !== undefined && expectedVersion !== (next.version ?? 0)) {
    return {
      context,
      kind: 'version_conflict',
      currentVersion: next.version ?? 0,
    };
  }

  if (body.subreddits !== undefined) {
    const normalized = normalizeSubreddits(body.subreddits);
    const error = CONFIG_SCHEMA.subreddits(normalized, 'subreddits');
    if (error) errors.push(error);
    else {
      previous.subreddits = next.subreddits;
      next.subreddits = normalized;
      changedFields.push('subreddits');
    }
  }

  if (includeFilters && body.filters !== undefined) {
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
      next.opportunityConfig = normalizeOpportunityConfig(body.opportunityConfig);
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
    return { context, kind: 'validation_error', errors };
  }

  const nowIso = new Date(now).toISOString();
  next.scopeId = next.scopeId || targetWorkspaceId;
  next.workspaceId = next.workspaceId || targetWorkspaceId;
  next.sourceSyncToken = token || context.token || '';
  next.createdAt = next.createdAt || nowIso;
  next.updatedAt = nowIso;
  next.version = (next.version ?? 0) + 1;

  if (persistMode === 'cas') {
    try {
      const casResult = await compareAndSwapAgentConfig(targetWorkspaceId, context.config || null, next);
      if (!casResult.ok) {
        return {
          context,
          kind: 'cas_conflict',
          currentVersion: casResult.current?.version ?? 0,
        };
      }
    } catch (error) {
      if (String(error.message || '').startsWith('CAS_LOCK_TIMEOUT:')) {
        return { context, kind: 'cas_timeout' };
      }
      throw error;
    }
  } else {
    await saveAgentConfig(targetWorkspaceId, next);
  }

  const auditEntry = {
    id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    action: auditAction,
    token: `${String(token || context.token || '').slice(0, 8)}...`,
    changedFields,
    previous,
    updatedAt: nowIso,
    version: next.version,
  };
  await appendAuditEntry(targetWorkspaceId, auditEntry);

  return {
    context,
    kind: 'ok',
    config: next,
    auditEntry,
  };
}

module.exports = {
  buildConfigPayload,
  buildLegacyConfigPayload,
  normalizeSubreddits,
  getWorkspaceConfigState,
  updateWorkspaceConfig,
};
