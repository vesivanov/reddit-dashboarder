// Agent API v1 — Config Endpoint
// GET /api/v1/config — Get current monitoring configuration
// PATCH /api/v1/config — Update configuration (validated)

const { withCORS } = require('../cors');
const { 
  createSuccessResponse, 
  createErrorResponse, 
  ERROR_CODES,
} = require('./response-helpers');
const { validateSchema, CONFIG_SCHEMA } = require('./validation');

// Import sync store
const { syncStore } = require('../api-handlers/sync');

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
 * Simple audit log (in-memory for now, should be persistent in production)
 */
const auditLog = [];
const MAX_AUDIT_ENTRIES = 1000;

function logAudit(action, token, changes, previous) {
  const entry = {
    id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    action,
    token: token.slice(0, 8) + '...', // Truncate for privacy
    changedFields: changes,
    previous: previous,
    timestamp: new Date().toISOString(),
  };
  
  auditLog.unshift(entry);
  
  // Keep only recent entries
  if (auditLog.length > MAX_AUDIT_ENTRIES) {
    auditLog.pop();
  }
  
  return entry;
}

/**
 * GET handler - Retrieve config
 */
async function getHandler(req, res, token) {
  const startTime = Date.now();
  
  const authResult = verifyApiKey(req);
  if (!authResult.valid) {
    return withCORS(req, res)
      .status(401)
      .json(createErrorResponse(ERROR_CODES.UNAUTHORIZED.code, authResult.error));
  }
  
  const data = syncStore.get(token);
  
  if (!data) {
    return withCORS(req, res)
      .status(404)
      .json(createErrorResponse(
        ERROR_CODES.NOT_FOUND.code,
        'No configuration found',
        { message: 'Sync data not found. User must sync from frontend first.' }
      ));
  }
  
  const config = {
    subreddits: data.settings?.subreddits || [],
    filters: data.filters || {},
    goals: data.settings?.aiGoals || '',
    aiPrompt: data.settings?.aiPrompt || '',
    threshold: data.settings?.aiThreshold || 3,
    model: data.settings?.openRouterModel || '',
    updatedAt: data.syncedAt,
  };
  
  const totalMs = Date.now() - startTime;
  const response = createSuccessResponse({ config }, { totalMs });
  
  return withCORS(req, res).status(200).json(response);
}

/**
 * PATCH handler - Update config
 */
async function patchHandler(req, res, token) {
  const startTime = Date.now();
  
  const authResult = verifyApiKey(req);
  if (!authResult.valid) {
    return withCORS(req, res)
      .status(401)
      .json(createErrorResponse(ERROR_CODES.UNAUTHORIZED.code, authResult.error));
  }
  
  // Parse body
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
      return withCORS(req, res)
        .status(400)
        .json(createErrorResponse(ERROR_CODES.VALIDATION_ERROR.code, 'Invalid JSON body'));
    }
  }
  
  // Get existing data
  const existingData = syncStore.get(token);
  if (!existingData) {
    return withCORS(req, res)
      .status(404)
      .json(createErrorResponse(
        ERROR_CODES.NOT_FOUND.code,
        'No configuration found'
      ));
  }
  
  // Track changes for audit
  const previous = {};
  const changedFields = [];
  
  // Validate and apply changes
  const errors = [];
  
  // Validate subreddits
  if (body.subreddits !== undefined) {
    const error = CONFIG_SCHEMA.subreddits(body.subreddits, 'subreddits');
    if (error) {
      errors.push(error);
    } else {
      previous.subreddits = existingData.settings?.subreddits;
      existingData.settings = existingData.settings || {};
      existingData.settings.subreddits = body.subreddits;
      changedFields.push('subreddits');
    }
  }
  
  // Validate filters
  if (body.filters !== undefined) {
    const filterErrors = validateSchema(body.filters, {
      minScore: CONFIG_SCHEMA.filters.schema.minScore,
      minComments: CONFIG_SCHEMA.filters.schema.minComments,
      daysBack: CONFIG_SCHEMA.filters.schema.daysBack,
    });
    
    if (filterErrors.length > 0) {
      errors.push(...filterErrors);
    } else {
      previous.filters = existingData.filters;
      existingData.filters = { ...existingData.filters, ...body.filters };
      changedFields.push('filters');
    }
  }
  
  // Validate goals
  if (body.goals !== undefined) {
    const error = CONFIG_SCHEMA.goals(body.goals, 'goals');
    if (error) {
      errors.push(error);
    } else {
      previous.goals = existingData.settings?.aiGoals;
      existingData.settings = existingData.settings || {};
      existingData.settings.aiGoals = body.goals;
      changedFields.push('goals');
    }
  }
  
  // Validate aiPrompt
  if (body.aiPrompt !== undefined) {
    const error = CONFIG_SCHEMA.aiPrompt(body.aiPrompt, 'aiPrompt');
    if (error) {
      errors.push(error);
    } else {
      previous.aiPrompt = existingData.settings?.aiPrompt;
      existingData.settings = existingData.settings || {};
      existingData.settings.aiPrompt = body.aiPrompt;
      changedFields.push('aiPrompt');
    }
  }
  
  // Validate threshold
  if (body.threshold !== undefined) {
    const error = CONFIG_SCHEMA.threshold(body.threshold, 'threshold');
    if (error) {
      errors.push(error);
    } else {
      previous.threshold = existingData.settings?.aiThreshold;
      existingData.settings = existingData.settings || {};
      existingData.settings.aiThreshold = body.threshold;
      changedFields.push('threshold');
    }
  }
  
  // Validate model
  if (body.model !== undefined) {
    const error = CONFIG_SCHEMA.model(body.model, 'model');
    if (error) {
      errors.push(error);
    } else {
      previous.model = existingData.settings?.openRouterModel;
      existingData.settings = existingData.settings || {};
      existingData.settings.openRouterModel = body.model;
      changedFields.push('model');
    }
  }
  
  // Return validation errors if any
  if (errors.length > 0) {
    return withCORS(req, res)
      .status(400)
      .json(createErrorResponse(
        ERROR_CODES.VALIDATION_ERROR.code,
        'Invalid configuration',
        errors
      ));
  }
  
  // Update timestamp
  existingData.syncedAt = new Date().toISOString();
  
  // Log audit
  const auditEntry = logAudit('CONFIG_UPDATE', token, changedFields, previous);
  
  // Build response
  const config = {
    subreddits: existingData.settings?.subreddits || [],
    filters: existingData.filters || {},
    goals: existingData.settings?.aiGoals || '',
    aiPrompt: existingData.settings?.aiPrompt || '',
    threshold: existingData.settings?.aiThreshold || 3,
    model: existingData.settings?.openRouterModel || '',
    updatedAt: existingData.syncedAt,
  };
  
  const totalMs = Date.now() - startTime;
  const response = createSuccessResponse({
    config,
    auditLog: {
      action: auditEntry.action,
      changedFields: auditEntry.changedFields,
      updatedAt: auditEntry.timestamp,
    },
  }, { totalMs });
  
  return withCORS(req, res).status(200).json(response);
}

/**
 * Main router
 */
async function handler(req, res) {
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
  
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return withCORS(req, res, 'GET, PATCH, OPTIONS').status(204).end();
  }
  
  if (req.method === 'GET') {
    return await getHandler(req, res, token);
  }
  
  if (req.method === 'PATCH') {
    return await patchHandler(req, res, token);
  }
  
  return withCORS(req, res)
    .status(405)
    .json(createErrorResponse(ERROR_CODES.VALIDATION_ERROR.code, 'Method not allowed'));
}

module.exports = handler;
