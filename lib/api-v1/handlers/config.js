// Agent API v1 — Config Endpoint
// GET /api/v1/config — Get current monitoring configuration
// PATCH /api/v1/config — Update configuration (validated)

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
const { resolveWorkspace } = require('../../services/workspace-service');
const {
  buildConfigPayload,
  getWorkspaceConfigState,
  updateWorkspaceConfig,
} = require('../../services/workspace-config-service');

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

function isWorkspaceRoute(req) {
  return Boolean(req.params?.workspaceId);
}

function ensureAuthorized(req, res, startTime) {
  if (isWorkspaceRoute(req)) {
    return ensureSessionOrBearerAuthorized(req, res, {
      methods: 'GET, PATCH, OPTIONS',
      message: 'Workspace config routes require an authenticated session or valid bearer token.',
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

async function parseBody(req, res) {
  try {
    return await parseJsonBody(req);
  } catch (_error) {
    const response = createErrorResponse(ERROR_CODES.VALIDATION_ERROR.code, 'Invalid JSON body');
    withCORS(req, res).status(400).json(response);
    return null;
  }
}

async function getHandler(req, res, { workspaceId, token }) {
  const startTime = Date.now();
  if (!ensureAuthorized(req, res, startTime)) {
    return res;
  }

  const context = await getWorkspaceConfigState({ workspaceId, token, deriveConfigFromSync: true });
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

async function patchHandler(req, res, { workspaceId, token }) {
  const startTime = Date.now();
  if (!ensureAuthorized(req, res, startTime)) {
    return res;
  }

  const body = await parseBody(req, res);
  if (res.finished) {
    return res;
  }

  const expectedVersion = getExpectedVersion(req, body);
  const updateArgs = {
    workspaceId,
    token,
    body,
    expectedVersion,
    persistMode: 'cas',
    auditAction: 'CONFIG_UPDATE',
    includeFilters: true,
  };
  let result = await updateWorkspaceConfig(updateArgs);

  if (expectedVersion === undefined && (result.kind === 'cas_conflict' || result.kind === 'cas_timeout')) {
    result = await updateWorkspaceConfig(updateArgs);
  }

  if (result.kind === 'not_found') {
    const error = createErrorResponse(ERROR_CODES.NOT_FOUND.code, 'No configuration found');
    error.timings.totalMs = Date.now() - startTime;
    return withCORS(req, res).status(404).json(error);
  }

  if (result.kind === 'validation_error') {
    const error = createErrorResponse(
      ERROR_CODES.VALIDATION_ERROR.code,
      'Invalid configuration',
      result.errors
    );
    error.timings.totalMs = Date.now() - startTime;
    return withCORS(req, res).status(400).json(error);
  }

  if (result.kind === 'version_conflict') {
    const error = createErrorResponse(
      'VERSION_CONFLICT',
      'Configuration version conflict',
      [{ field: 'version', message: `Expected ${result.currentVersion} but received ${expectedVersion}` }]
    );
    error.timings.totalMs = Date.now() - startTime;
    return withCORS(req, res).status(409).json(error);
  }

  if (result.kind === 'cas_conflict') {
    const error = createErrorResponse(
      'VERSION_CONFLICT',
      'Configuration version conflict',
      [{ field: 'version', message: `Current stored version is ${result.currentVersion}` }]
    );
    error.timings.totalMs = Date.now() - startTime;
    return withCORS(req, res).status(409).json(error);
  }

  if (result.kind === 'cas_timeout') {
    const response = createErrorResponse(
      'VERSION_CONFLICT',
      'Configuration update contention',
      [{ field: 'version', message: 'Could not acquire config update lock. Retry the request.' }]
    );
    response.timings.totalMs = Date.now() - startTime;
    return withCORS(req, res).status(409).json(response);
  }

  const responseData = {
    config: buildConfigPayload(result.config),
  };
  if (result.auditEntry) {
    responseData.auditLog = {
      action: result.auditEntry.action,
      changedFields: result.auditEntry.changedFields,
      previous: result.auditEntry.previous,
      updatedAt: result.auditEntry.updatedAt,
      version: result.auditEntry.version,
    };
  }

  const response = createSuccessResponse(responseData, { totalMs: Date.now() - startTime });

  res.setHeader('ETag', String(result.config.version));
  return withCORS(req, res).status(200).json(response);
}

async function handler(req, res) {
  const { query } = parseRequest(req);
  const workspaceId = req.params?.workspaceId || getQueryValue(query, 'workspace_id', '').trim();
  const token = getQueryValue(query, 'token', process.env.DIGEST_SYNC_TOKEN || '').trim();

  if (!workspaceId && !token) {
    const error = createErrorResponse(ERROR_CODES.VALIDATION_ERROR.code, 'Missing workspace identifier');
    return withCORS(req, res).status(400).json(error);
  }

  let resolvedWorkspace = null;
  if (workspaceId || token) {
    resolvedWorkspace = await resolveWorkspace({ workspaceId, token });
  }
  const target = {
    workspaceId: resolvedWorkspace?.workspaceId || workspaceId || null,
    token: resolvedWorkspace?.token || token,
  };

  if (req.method === 'OPTIONS') {
    return withCORS(req, res, 'GET, PATCH, OPTIONS').status(204).end();
  }

  if (req.method === 'GET') {
    return getHandler(req, res, target);
  }

  if (req.method === 'PATCH') {
    return patchHandler(req, res, target);
  }

  const error = createErrorResponse(ERROR_CODES.VALIDATION_ERROR.code, 'Method not allowed');
  return withCORS(req, res).status(405).json(error);
}

module.exports = handler;
