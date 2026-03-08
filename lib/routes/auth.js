const authStartHandler = require('../api-handlers/auth/start');
const authCallbackHandler = require('../api-handlers/auth/callback');
const authLogoutHandler = require('../api-handlers/auth/logout');
const authStatusHandler = require('../api-handlers/auth/status');
const authRefreshHandler = require('../api-handlers/auth/refresh');

function registerAuthRoutes(app, limiters, handlers = {}) {
  const { generalLimiter } = limiters;

  app.get('/api/auth/start', generalLimiter, authStartHandler);
  app.get('/api/auth/callback', generalLimiter, authCallbackHandler);
  app.get('/api/auth/logout', generalLimiter, authLogoutHandler);
  app.get('/api/auth/status', generalLimiter, authStatusHandler);
  app.get('/api/auth/refresh', generalLimiter, authRefreshHandler);

  if (handlers.authDebugRedirectHandler) {
    app.get('/api/auth/debug-redirect', generalLimiter, handlers.authDebugRedirectHandler);
  }
  if (handlers.authTestOAuthUrlHandler) {
    app.get('/api/auth/test-oauth-url', generalLimiter, handlers.authTestOAuthUrlHandler);
  }
  if (handlers.authVerifyRedditSettingsHandler) {
    app.get('/api/auth/verify-reddit-settings', generalLimiter, handlers.authVerifyRedditSettingsHandler);
  }
}

module.exports = { registerAuthRoutes };
