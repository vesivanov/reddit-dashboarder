const cronRefreshHandler = require('../../api/cron/refresh-opportunities');
const notifyMeHandler = require('../api-handlers/notify-me');

function registerAutomationRoutes(app, limiters) {
  const { generalLimiter, waitlistLimiter } = limiters;

  app.get('/api/cron/refresh-opportunities', generalLimiter, cronRefreshHandler);
  app.post('/api/notify-me', waitlistLimiter, notifyMeHandler);
  app.options('/api/notify-me', notifyMeHandler);
}

module.exports = { registerAutomationRoutes };
