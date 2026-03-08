// /api/cron/refresh-opportunities - Scheduled endpoint for cron-job.org
// Fetches Reddit posts, runs opportunity ranking, stores in KV
// GET /api/cron/refresh-opportunities
// Header: X-Cron-Secret: YOUR_CRON_SECRET_KEY

const { withCORS } = require('../../lib/cors');
const { RedditPoller } = require('../../lib/poller');
const { loadPollerRuntimeConfig } = require('../../lib/services/poller-config');

async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return withCORS(req, res, 'GET, OPTIONS').status(204).end();
  }

  if (req.method !== 'GET') {
    return withCORS(req, res).status(405).json({ error: 'Method not allowed' });
  }

  const key = req.headers['x-cron-secret'];
  if (key !== process.env.CRON_SECRET_KEY) {
    return withCORS(req, res).status(401).json({
      error: 'Unauthorized',
      message: 'Provide valid X-Cron-Secret header'
    });
  }

  try {
    if (!process.env.REDDIT_CLIENT_ID || !process.env.REDDIT_CLIENT_SECRET) {
      return withCORS(req, res).status(500).json({
        error: 'Configuration error',
        message: 'Reddit API credentials not configured'
      });
    }

    let runtimeConfig;
    try {
      runtimeConfig = await loadPollerRuntimeConfig();
      if (runtimeConfig.source === 'agent-config') {
        console.log('[cron] Using', runtimeConfig.source, 'with', runtimeConfig.subreddits.length, 'subreddits');
      } else {
        console.log('[cron] No persisted config found, using defaults');
      }
    } catch (err) {
      console.error('[cron] Failed to resolve poller config:', err.message);
      runtimeConfig = {
        source: 'defaults',
        subreddits: ['SEO', 'webdev', 'startups', 'freelance', 'marketing'],
        settings: {
          aiGoals: 'Find SEO and AI search consulting clients',
          aiContext: 'Helping businesses improve visibility in traditional and AI-powered search (ChatGPT, Perplexity)',
          aiThreshold: 4,
          openRouterModel: process.env.POLLER_OPENROUTER_MODEL || 'google/gemini-2.0-flash-exp:free',
          scoringConfig: null,
        },
      };
    }

    const poller = new RedditPoller();
    const result = await poller.poll(runtimeConfig.subreddits, runtimeConfig.settings);

    return withCORS(req, res).status(200).json({
      success: true,
      polledAt: result.polledAt,
      postsFetched: result.postCount,
      opportunitiesFound: result.opportunityCount,
      subreddits: result.subreddits,
      subredditCount: result.subreddits.length,
      usingUserConfig: runtimeConfig.source !== 'defaults',
      configSource: runtimeConfig.source,
      nextPoll: 'In 2 hours (set via cron-job.org)',
    });
  } catch (error) {
    console.error('[cron/refresh-opportunities] Error:', error);
    return withCORS(req, res).status(500).json({
      error: 'Poll failed',
      message: error.message,
    });
  }
}

module.exports = handler;
