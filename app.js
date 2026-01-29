const express = require('express');
const path = require('path');
const fs = require('fs');

const redditHandler = require('./api/reddit');
const aiRankHandler = require('./api/reddit/ai-rank');
const authStartHandler = require('./api/auth/start');
const authCallbackHandler = require('./api/auth/callback');
const authLogoutHandler = require('./api/auth/logout');
const authStatusHandler = require('./api/auth/status');
const openrouterKeyHandler = require('./api/settings/openrouter-key');

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

  // Serve static files from root
  app.use(express.static(__dirname));

  // API routes
  app.get('/api/reddit', redditHandler);
  if (redditTestHandler) {
    app.get('/api/reddit-test', redditTestHandler);
  }
  app.post('/api/reddit/ai-rank', aiRankHandler);
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

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
    res.sendFile(path.join(__dirname, 'index.html'));
  });

  return app;
}

module.exports = createApp;
