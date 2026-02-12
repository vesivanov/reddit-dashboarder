// /api/cron/refresh-leads - Scheduled endpoint for cron-job.org
// Fetches Reddit posts, runs AI ranking, stores in KV
// GET /api/cron/refresh-leads
// Header: X-Cron-Secret: YOUR_CRON_SECRET_KEY

const { withCORS } = require('../../lib/cors');
const { RedditPoller } = require('../../lib/poller');

const DEFAULT_SUBREDDITS = ['SEO', 'webdev', 'startups', 'freelance', 'marketing'];

async function handler(req, res) {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return withCORS(req, res, 'GET, OPTIONS').status(204).end();
  }

  if (req.method !== 'GET') {
    return withCORS(req, res).status(405).json({ error: 'Method not allowed' });
  }

  // Auth check - secret in header (not URL for security)
  const key = req.headers['x-cron-secret'];
  
  if (key !== process.env.CRON_SECRET_KEY) {
    return withCORS(req, res).status(401).json({ 
      error: 'Unauthorized',
      message: 'Provide valid X-Cron-Secret header'
    });
  }

  try {
    // Check required env vars
    if (!process.env.REDDIT_CLIENT_ID || !process.env.REDDIT_CLIENT_SECRET) {
      return withCORS(req, res).status(500).json({
        error: 'Configuration error',
        message: 'Reddit API credentials not configured'
      });
    }

    // Get settings from KV or use defaults
    const poller = new RedditPoller();
    const subreddits = DEFAULT_SUBREDDITS;
    const settings = {
      aiGoals: 'Find SEO and AI search consulting clients',
      aiContext: 'Helping businesses improve visibility in traditional and AI-powered search (ChatGPT, Perplexity)',
    };

    // Run the poll
    const result = await poller.poll(subreddits, settings);

    return withCORS(req, res).status(200).json({
      success: true,
      polledAt: result.polledAt,
      postsFetched: result.postCount,
      hotLeadsFound: result.hotLeadCount,
      subreddits: result.subreddits,
      nextPoll: 'In 2 hours (set via cron-job.org)',
    });
  } catch (error) {
    console.error('[cron/refresh-leads] Error:', error);
    return withCORS(req, res).status(500).json({
      error: 'Poll failed',
      message: error.message,
    });
  }
}

module.exports = handler;
