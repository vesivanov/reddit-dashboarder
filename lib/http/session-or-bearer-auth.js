const { withCORS } = require('../cors');
const { readSignedCookie } = require('../cookies');

function hasAuthenticatedSession(req) {
  return Boolean(readSignedCookie(req, 'access') || readSignedCookie(req, 'refresh'));
}

function hasInternalBearerAuth(req) {
  const authHeader = req.headers.authorization || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return false;
  }

  const token = match[1].trim();
  return Boolean(
    process.env.AGENT_API_KEY && token === process.env.AGENT_API_KEY
  );
}

function ensureSessionOrBearerAuthorized(req, res, {
  methods = 'GET, POST, OPTIONS',
  message = 'Request requires an authenticated session or valid bearer token.',
} = {}) {
  if (hasAuthenticatedSession(req) || hasInternalBearerAuth(req)) {
    return true;
  }

  withCORS(req, res, methods).status(401).json({
    error: 'Unauthorized',
    message,
  });
  return false;
}

module.exports = {
  hasAuthenticatedSession,
  hasInternalBearerAuth,
  ensureSessionOrBearerAuthorized,
};
