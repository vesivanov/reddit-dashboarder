// /api/cron/refresh-leads - Scheduled endpoint for cron-job.org
// Fetches Reddit posts, runs AI ranking, stores in KV
// GET /api/cron/refresh-leads
// Header: X-Cron-Secret: YOUR_CRON_SECRET_KEY

const { withCORS } = require('../../lib/cors');
const { RedditPoller } = require('../../lib/poller');
const storage = require('../../lib/storage');

const DEFAULT_SUBREDDITS = ['SEO', 'webdev', 'startups', 'freelance', 'marketing'];
const DEFAULT_SETTINGS = {
  aiGoals: 'Find SEO and AI search consulting clients',
  aiContext: 'Helping businesses improve visibility in traditional and AI-powered search (ChatGPT, Perplexity)',
};

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

    // Get user's config from shared KV or use defaults
    let userConfig;
    try {
      userConfig = await storage.get('cron-user-config');
      if (userConfig?.subreddits?.length > 0) {
        console.log('[cron] Using user config:', userConfig.subreddits.length, 'subreddits');
      } else {
        console.log('[cron] No user config found, using defaults');
      }
    } catch (err) {
      console.error('[cron] Failed to read user config:', err.message);
    }

    const subreddits = userConfig?.subreddits || DEFAULT_SUBREDDITS;
    const settings = {
      aiGoals: userConfig?.aiGoals || DEFAULT_SETTINGS.aiGoals,
      aiContext: userConfig?.aiContext || DEFAULT_SETTINGS.aiContext,
    };

    const poller = new RedditPoller();

    // Run the poll
    const result = await poller.poll(subreddits, settings);

    return withCORS(req, res).status(200).json({
      success: true,
      polledAt: result.polledAt,
      postsFetched: result.postCount,
      hotLeadsFound: result.hotLeadCount,
      subreddits: result.subreddits,
      subredditCount: result.subreddits.length,
      usingUserConfig: !!userConfig?.subreddits?.length,
      configSource: userConfig?.subreddits?.length ? 'user-settings' : 'defaults',
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
