const express = require('express');
const path = require('path');
const fs = require('fs');

const redditHandler = require('./lib/api-handlers/reddit');
const redditSnapshotHandler = require('./lib/api-handlers/reddit/snapshot');
const aiRankHandler = require('./lib/api-handlers/reddit/ai-rank');
const digestHandler = require('./lib/api-handlers/reddit/digest');
const authStartHandler = require('./lib/api-handlers/auth/start');
const authCallbackHandler = require('./lib/api-handlers/auth/callback');
const authLogoutHandler = require('./lib/api-handlers/auth/logout');
const authStatusHandler = require('./lib/api-handlers/auth/status');
const authRefreshHandler = require('./lib/api-handlers/auth/refresh');
const openrouterKeyHandler = require('./lib/api-handlers/settings/openrouter-key');
const serverOpenrouterKeyHandler = require('./lib/api-handlers/settings/server-openrouter-key');
const settingsImportHandler = require('./lib/api-handlers/settings/import');
const syncHandler = require('./lib/api-handlers/sync');
const openrouterModelsHandler = require('./lib/api-handlers/openrouter/models');
const { aiRankLimiter, redditLimiter, generalLimiter, waitlistLimiter } = require('./lib/middleware/rate-limit');

function optionalHandler(relativePath) {
  try {
    const absolute = path.join(__dirname, relativePath);
    if (!fs.existsSync(absolute)) return null;
    return require(absolute);
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND') return null;
    throw err;
  }
}

const redditTestHandler = optionalHandler('./dev-only/reddit-test.js');
const authDebugRedirectHandler = optionalHandler('./dev-only/auth/debug-redirect.js');
const authTestOAuthUrlHandler = optionalHandler('./dev-only/auth/test-oauth-url.js');
const authVerifyRedditSettingsHandler = optionalHandler('./dev-only/auth/verify-reddit-settings.js');

function createApp() {
  const app = express();

  // Parse JSON bodies for POST requests (increase limit for AI ranking endpoint)
  app.use(express.json({ limit: '10mb' }));

  // Serve static files from public
  app.use(express.static(path.join(__dirname, 'public')));

  // API routes (with rate limiting)
  app.get('/api/reddit', redditLimiter, redditHandler);
  app.get('/api/reddit/snapshot', redditLimiter, redditSnapshotHandler);
  if (redditTestHandler) {
    app.get('/api/reddit-test', redditLimiter, redditTestHandler);
  }
  app.post('/api/reddit/ai-rank', aiRankLimiter, aiRankHandler);
  app.get('/api/reddit/digest', aiRankLimiter, digestHandler);
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });
  app.get('/api/root-info', generalLimiter, require('./lib/api-handlers/root-info'));
  app.get('/api/openrouter/models', generalLimiter, openrouterModelsHandler);

  // Auth routes (with rate limiting to prevent brute force)
  app.get('/api/auth/start', generalLimiter, authStartHandler);
  app.get('/api/auth/callback', generalLimiter, authCallbackHandler);
  app.get('/api/auth/logout', generalLimiter, authLogoutHandler);
  app.get('/api/auth/status', generalLimiter, authStatusHandler);
  app.get('/api/auth/refresh', generalLimiter, authRefreshHandler);

  // Settings routes (secure API key storage)
  app.get('/api/settings/openrouter-key', generalLimiter, openrouterKeyHandler);
  app.post('/api/settings/openrouter-key', generalLimiter, openrouterKeyHandler);
  app.delete('/api/settings/openrouter-key', generalLimiter, openrouterKeyHandler);
  app.options('/api/settings/openrouter-key', openrouterKeyHandler);

  // Server-side settings routes (for digest/automated use)
  app.get('/api/settings/server/openrouter-key', generalLimiter, serverOpenrouterKeyHandler);
  app.post('/api/settings/server/openrouter-key', generalLimiter, serverOpenrouterKeyHandler);
  app.delete('/api/settings/server/openrouter-key', generalLimiter, serverOpenrouterKeyHandler);
  app.options('/api/settings/server/openrouter-key', serverOpenrouterKeyHandler);

  // Settings import/export routes (for AI agents)
  app.get('/api/settings/import', generalLimiter, settingsImportHandler);
  app.post('/api/settings/import', generalLimiter, settingsImportHandler);
  app.delete('/api/settings/import', generalLimiter, settingsImportHandler);
  app.options('/api/settings/import', settingsImportHandler);

  // Sync routes (frontend-AI data exchange)
  app.all('/api/sync', generalLimiter, syncHandler);
  app.all('/api/sync/:token', generalLimiter, syncHandler);

  // Agent API v1 routes (productized API for AI agents)
  // Note: These have API key auth + rate limiting for defense in depth
  const v1SnapshotHandler = require('./lib/api-v1/handlers/snapshot');
  const v1ConfigHandler = require('./lib/api-v1/handlers/config');
  const v1JobsHandler = require('./lib/api-v1/handlers/jobs');

  app.get('/api/v1/snapshot', aiRankLimiter, v1SnapshotHandler);
  app.get('/api/v1/config', generalLimiter, v1ConfigHandler);
  app.patch('/api/v1/config', aiRankLimiter, v1ConfigHandler);
  app.post('/api/v1/analyze', aiRankLimiter, v1JobsHandler);
  app.get('/api/v1/jobs/:jobId', generalLimiter, v1JobsHandler);

  // Background poller routes (automated lead fetching)
  const cronRefreshHandler = require('./api/cron/refresh-leads');
  const v1LeadsLatestHandler = require('./api/v1/leads/latest');
  const notifyMeHandler = require('./lib/api-handlers/notify-me');

  app.get('/api/cron/refresh-leads', generalLimiter, cronRefreshHandler);
  app.get('/api/v1/leads/latest', generalLimiter, v1LeadsLatestHandler);
  app.post('/api/notify-me', waitlistLimiter, notifyMeHandler);
  app.options('/api/notify-me', notifyMeHandler);

  if (authDebugRedirectHandler) {
    app.get('/api/auth/debug-redirect', generalLimiter, authDebugRedirectHandler);
  }
  if (authTestOAuthUrlHandler) {
    app.get('/api/auth/test-oauth-url', generalLimiter, authTestOAuthUrlHandler);
  }
  if (authVerifyRedditSettingsHandler) {
    app.get('/api/auth/verify-reddit-settings', generalLimiter, authVerifyRedditSettingsHandler);
  }

  // Landing page at root
  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'landing.html'));
  });
  // Dashboard at /app (and SPA sub-routes)
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  return app;
}

module.exports = createApp;
