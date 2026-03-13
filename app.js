const express = require('express');
const path = require('path');
const fs = require('fs');

const { aiRankLimiter, redditLimiter, generalLimiter } = require('./lib/middleware/rate-limit');
const { securityHeaders } = require('./lib/middleware/security-headers');
const { registerRoutes } = require('./lib/routes/register');
const { ensureJobQueueWorker } = require('./lib/services/analysis-job-queue');

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
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  // Keep the default body limit modest. Larger payloads should be handled deliberately.
  app.use(express.json({ limit: '1mb' }));
  app.use(securityHeaders);

  // Serve static files from public without auto-serving index.html at /
  app.use(express.static(path.join(__dirname, 'public'), { index: false }));
  ensureJobQueueWorker();

  const limiters = { aiRankLimiter, redditLimiter, generalLimiter };
  registerRoutes(app, limiters, {
    redditTestHandler,
    authDebugRedirectHandler,
    authTestOAuthUrlHandler,
    authVerifyRedditSettingsHandler,
  });

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
