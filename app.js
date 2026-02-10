const express = require('express');
const path = require('path');
const fs = require('fs');

const redditHandler = require('./lib/api-handlers/reddit');
const aiRankHandler = require('./lib/api-handlers/reddit/ai-rank');
const digestHandler = require('./lib/api-handlers/reddit/digest');
const authStartHandler = require('./lib/api-handlers/auth/start');
const authCallbackHandler = require('./lib/api-handlers/auth/callback');
const authLogoutHandler = require('./lib/api-handlers/auth/logout');
const authStatusHandler = require('./lib/api-handlers/auth/status');
const openrouterKeyHandler = require('./lib/api-handlers/settings/openrouter-key');
const settingsImportHandler = require('./lib/api-handlers/settings/import');
const contextBundleHandler = require('./lib/api-handlers/settings/context-bundle');
const openrouterModelsHandler = require('./lib/api-handlers/openrouter/models');

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

  // API routes
  app.get('/api/reddit', redditHandler);
  if (redditTestHandler) {
    app.get('/api/reddit-test', redditTestHandler);
  }
  app.post('/api/reddit/ai-rank', aiRankHandler);
  app.get('/api/reddit/digest', digestHandler);
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });
  app.get('/api/root-info', require('./lib/api-handlers/root-info'));
  app.get('/api/openrouter/models', openrouterModelsHandler);

  // Auth routes
  app.get('/api/auth/start', authStartHandler);
  app.get('/api/auth/callback', authCallbackHandler);
  app.get('/api/auth/logout', authLogoutHandler);
  app.get('/api/auth/status', authStatusHandler);

  // Settings routes (secure API key storage)
  app.get('/api/settings/openrouter-key', openrouterKeyHandler);
  app.post('/api/settings/openrouter-key', openrouterKeyHandler);
  app.delete('/api/settings/openrouter-key', openrouterKeyHandler);
  app.options('/api/settings/openrouter-key', openrouterKeyHandler);

  // Settings import/export routes (for AI agents)
  app.get('/api/settings/import', settingsImportHandler);
  app.post('/api/settings/import', settingsImportHandler);
  app.delete('/api/settings/import', settingsImportHandler);
  app.options('/api/settings/import', settingsImportHandler);

  // Context bundle routes (human-AI collaboration)
  app.all('/api/context-bundle', contextBundleHandler);
  app.all('/api/context-bundle/:token', contextBundleHandler);
  app.all('/api/context-bundle/:token/apply', contextBundleHandler);

  if (authDebugRedirectHandler) {
    app.get('/api/auth/debug-redirect', authDebugRedirectHandler);
  }
  if (authTestOAuthUrlHandler) {
    app.get('/api/auth/test-oauth-url', authTestOAuthUrlHandler);
  }
  if (authVerifyRedditSettingsHandler) {
    app.get('/api/auth/verify-reddit-settings', authVerifyRedditSettingsHandler);
  }

  // Serve index.html for all other routes (SPA routing)
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  return app;
}

module.exports = createApp;
