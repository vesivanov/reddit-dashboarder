const v1SnapshotHandler = require('../api-v1/handlers/snapshot');
const v1ConfigHandler = require('../api-v1/handlers/config');
const v1JobsHandler = require('../api-v1/handlers/jobs');
const v1LeadsLatestHandler = require('../../api/v1/leads/latest');

function registerAgentApiRoutes(app, limiters) {
  const { aiRankLimiter, generalLimiter } = limiters;

  app.options('/api/v1/snapshot', v1SnapshotHandler);
  app.get('/api/v1/snapshot', aiRankLimiter, v1SnapshotHandler);
  app.options('/api/v1/config', v1ConfigHandler);
  app.get('/api/v1/config', generalLimiter, v1ConfigHandler);
  app.patch('/api/v1/config', aiRankLimiter, v1ConfigHandler);
  app.options('/api/v1/analyze', v1JobsHandler);
  app.post('/api/v1/analyze', aiRankLimiter, v1JobsHandler);
  app.options('/api/v1/jobs/drain', v1JobsHandler);
  app.post('/api/v1/jobs/drain', aiRankLimiter, v1JobsHandler);
  app.options('/api/v1/jobs/:jobId', v1JobsHandler);
  app.get('/api/v1/jobs/:jobId', generalLimiter, v1JobsHandler);
  app.options('/api/v1/leads/latest', v1LeadsLatestHandler);
  app.get('/api/v1/leads/latest', generalLimiter, v1LeadsLatestHandler);
}

module.exports = { registerAgentApiRoutes };
