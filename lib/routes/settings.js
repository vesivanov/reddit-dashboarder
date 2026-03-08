const openrouterKeyHandler = require('../api-handlers/settings/openrouter-key');
const serverOpenrouterKeyHandler = require('../api-handlers/settings/server-openrouter-key');
const syncHandler = require('../api-handlers/sync');

function registerSettingsRoutes(app, limiters) {
  const { generalLimiter } = limiters;

  app.get('/api/settings/openrouter-key', generalLimiter, openrouterKeyHandler);
  app.post('/api/settings/openrouter-key', generalLimiter, openrouterKeyHandler);
  app.delete('/api/settings/openrouter-key', generalLimiter, openrouterKeyHandler);
  app.options('/api/settings/openrouter-key', openrouterKeyHandler);

  app.get('/api/settings/server/openrouter-key', generalLimiter, serverOpenrouterKeyHandler);
  app.post('/api/settings/server/openrouter-key', generalLimiter, serverOpenrouterKeyHandler);
  app.delete('/api/settings/server/openrouter-key', generalLimiter, serverOpenrouterKeyHandler);
  app.options('/api/settings/server/openrouter-key', serverOpenrouterKeyHandler);

  app.all('/api/sync', generalLimiter, syncHandler);
  app.all('/api/sync/:token', generalLimiter, syncHandler);
}

module.exports = { registerSettingsRoutes };
