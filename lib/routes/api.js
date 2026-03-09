const redditHandler = require('../api-handlers/reddit');
const redditSnapshotHandler = require('../api-handlers/reddit/snapshot');
const redditCoverageHandler = require('../api-handlers/reddit/coverage');
const aiRankHandler = require('../api-handlers/reddit/ai-rank');
const digestHandler = require('../api-handlers/reddit/digest');
const openrouterModelsHandler = require('../api-handlers/openrouter/models');
const rootInfoHandler = require('../api-handlers/root-info');

function registerApiRoutes(app, limiters, handlers = {}) {
  const { aiRankLimiter, redditLimiter, generalLimiter } = limiters;

  app.get('/api/reddit', redditLimiter, redditHandler);
  app.get('/api/reddit/snapshot', redditLimiter, redditSnapshotHandler);
  app.options('/api/reddit/coverage', redditCoverageHandler);
  app.get('/api/reddit/coverage', redditLimiter, redditCoverageHandler);
  app.delete('/api/reddit/coverage', redditLimiter, redditCoverageHandler);
  app.options('/api/reddit/advance', redditCoverageHandler);
  app.post('/api/reddit/advance', redditLimiter, redditCoverageHandler);
  if (handlers.redditTestHandler) {
    app.get('/api/reddit-test', redditLimiter, handlers.redditTestHandler);
  }
  app.post('/api/reddit/ai-rank', aiRankLimiter, aiRankHandler);
  app.get('/api/reddit/digest', aiRankLimiter, digestHandler);
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });
  app.get('/api/root-info', generalLimiter, rootInfoHandler);
  app.get('/api/openrouter/models', generalLimiter, openrouterModelsHandler);
}

module.exports = { registerApiRoutes };
