const { withCORS } = require('../cors');
const { parseJsonBody } = require('../http/parse-json-body');
const { ensureSessionOrBearerAuthorized } = require('../http/session-or-bearer-auth');
const { resolveWorkspace } = require('../services/workspace-service');

function ensureAuthorized(req, res) {
  return ensureSessionOrBearerAuthorized(req, res, {
    methods: 'POST, OPTIONS',
    message: 'Workspace bootstrap requires an authenticated session or valid bearer token.',
  });
}

async function postHandler(req, res) {
  if (!ensureAuthorized(req, res)) return;

  let body;
  try {
    body = await parseJsonBody(req);
  } catch (_error) {
    return withCORS(req, res, 'POST, OPTIONS').status(400).json({ error: 'Invalid JSON body' });
  }

  const token = String(body?.token || '').trim();
  if (!token) {
    return withCORS(req, res, 'POST, OPTIONS').status(400).json({
      error: 'token is required',
      message: 'Provide a sync token to bootstrap a workspace.',
    });
  }

  const resolved = await resolveWorkspace({ token });
  return withCORS(req, res, 'POST, OPTIONS').status(200).json({
    success: true,
    token,
    workspaceId: resolved.workspaceId,
  });
}

async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return withCORS(req, res, 'POST, OPTIONS').status(204).end();
  }

  if (req.method === 'POST') {
    return postHandler(req, res);
  }

  return withCORS(req, res, 'POST, OPTIONS').status(405).json({ error: 'Method not allowed' });
}

module.exports = handler;
