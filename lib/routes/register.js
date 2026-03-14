const redditHandler = require('../api-handlers/reddit');
const redditSnapshotHandler = require('../api-handlers/reddit/snapshot');
const redditCoverageHandler = require('../api-handlers/reddit/coverage');
const aiRankHandler = require('../api-handlers/reddit/ai-rank');
const aiRankAuditsHandler = require('../api-handlers/reddit/ai-rank-audits');
const openrouterModelsHandler = require('../api-handlers/openrouter/models');

const authStartHandler = require('../api-handlers/auth/start');
const authCallbackHandler = require('../api-handlers/auth/callback');
const authLogoutHandler = require('../api-handlers/auth/logout');
const authStatusHandler = require('../api-handlers/auth/status');
const authRefreshHandler = require('../api-handlers/auth/refresh');

const openrouterKeyHandler = require('../api-handlers/settings/openrouter-key');
const workspacesHandler = require('../api-handlers/workspaces');

const v1SnapshotHandler = require('../api-v1/handlers/snapshot');
const v1ConfigHandler = require('../api-v1/handlers/config');
const v1JobsHandler = require('../api-v1/handlers/jobs');

function registerRoutes(app, limiters, handlers = {}) {
  const { aiRankLimiter, redditLimiter, generalLimiter } = limiters;
  const {
    redditTestHandler,
    authDebugRedirectHandler,
    authTestOAuthUrlHandler,
    authVerifyRedditSettingsHandler,
  } = handlers;

  app.get('/api/reddit', redditLimiter, redditHandler);
  app.get('/api/reddit/snapshot', redditLimiter, redditSnapshotHandler);
  app.options('/api/reddit/coverage', redditCoverageHandler);
  app.get('/api/reddit/coverage', redditLimiter, redditCoverageHandler);
  app.delete('/api/reddit/coverage', redditLimiter, redditCoverageHandler);
  app.options('/api/reddit/advance', redditCoverageHandler);
  app.get('/api/reddit/advance', redditLimiter, redditCoverageHandler);
  app.post('/api/reddit/advance', redditLimiter, redditCoverageHandler);
  app.options('/api/reddit/ai-rank/audits', aiRankAuditsHandler);
  app.get('/api/reddit/ai-rank/audits', generalLimiter, aiRankAuditsHandler);
  if (redditTestHandler) {
    app.get('/api/reddit-test', redditLimiter, redditTestHandler);
  }
  app.post('/api/reddit/ai-rank', aiRankLimiter, aiRankHandler);
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });
  app.get('/api/openrouter/models', generalLimiter, openrouterModelsHandler);

  app.get('/api/auth/start', generalLimiter, authStartHandler);
  app.get('/api/auth/callback', generalLimiter, authCallbackHandler);
  app.get('/api/auth/logout', generalLimiter, authLogoutHandler);
  app.get('/api/auth/status', generalLimiter, authStatusHandler);
  app.get('/api/auth/refresh', generalLimiter, authRefreshHandler);
  if (authDebugRedirectHandler) {
    app.get('/api/auth/debug-redirect', generalLimiter, authDebugRedirectHandler);
  }
  if (authTestOAuthUrlHandler) {
    app.get('/api/auth/test-oauth-url', generalLimiter, authTestOAuthUrlHandler);
  }
  if (authVerifyRedditSettingsHandler) {
    app.get('/api/auth/verify-reddit-settings', generalLimiter, authVerifyRedditSettingsHandler);
  }

  app.get('/api/settings/openrouter-key', generalLimiter, openrouterKeyHandler);
  app.post('/api/settings/openrouter-key', generalLimiter, openrouterKeyHandler);
  app.delete('/api/settings/openrouter-key', generalLimiter, openrouterKeyHandler);
  app.options('/api/settings/openrouter-key', openrouterKeyHandler);

  app.post('/api/workspaces', generalLimiter, workspacesHandler);
  app.options('/api/workspaces', workspacesHandler);

  app.options('/api/workspaces/:workspaceId/snapshot', v1SnapshotHandler);
  app.get('/api/workspaces/:workspaceId/snapshot', aiRankLimiter, v1SnapshotHandler);
  app.put('/api/workspaces/:workspaceId/snapshot', generalLimiter, v1SnapshotHandler);
  app.options('/api/workspaces/:workspaceId/config', v1ConfigHandler);
  app.get('/api/workspaces/:workspaceId/config', generalLimiter, v1ConfigHandler);
  app.patch('/api/workspaces/:workspaceId/config', generalLimiter, v1ConfigHandler);
  app.options('/api/workspaces/:workspaceId/analyze', v1JobsHandler);
  app.post('/api/workspaces/:workspaceId/analyze', aiRankLimiter, v1JobsHandler);
  app.options('/api/workspaces/:workspaceId/jobs/:jobId', v1JobsHandler);
  app.get('/api/workspaces/:workspaceId/jobs/:jobId', generalLimiter, v1JobsHandler);
  app.options('/api/v1/jobs/drain', v1JobsHandler);
  app.post('/api/v1/jobs/drain', aiRankLimiter, v1JobsHandler);
}

module.exports = { registerRoutes };
