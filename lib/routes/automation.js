const cronRefreshHandler = require('../../api/cron/refresh-leads');
const notifyMeHandler = require('../api-handlers/notify-me');

function registerAutomationRoutes(app, limiters) {
  const { generalLimiter, waitlistLimiter } = limiters;

  app.get('/api/cron/refresh-leads', generalLimiter, cronRefreshHandler);
  app.post('/api/notify-me', waitlistLimiter, notifyMeHandler);
  app.options('/api/notify-me', notifyMeHandler);
}

module.exports = { registerAutomationRoutes };
