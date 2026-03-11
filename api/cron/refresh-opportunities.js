// /api/cron/refresh-opportunities - Scheduled endpoint for cron-job.org
// Fetches Reddit posts, runs opportunity ranking, stores in KV
// GET /api/cron/refresh-opportunities
// Header: X-Cron-Secret: YOUR_CRON_SECRET_KEY

const { withCORS } = require('../../lib/cors');
async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return withCORS(req, res, 'GET, OPTIONS').status(204).end();
  }

  if (req.method !== 'GET') {
    return withCORS(req, res).status(405).json({ error: 'Method not allowed' });
  }

  return withCORS(req, res).status(503).json({
    error: 'Poller disabled',
    message: 'The Reddit opportunities poller is temporarily disabled.',
  });
}

module.exports = handler;
