// /api/v1/opportunities/latest - Get latest polled opportunities
// Protected by AGENT_API_KEY because opportunity output can be sensitive.
// GET /api/v1/opportunities/latest

const { withCORS } = require('../../../lib/cors');
const { verifyAgentApiKey } = require('../../../lib/api-v1/auth');
const storage = require('../../../lib/storage');

async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return withCORS(req, res, 'GET, OPTIONS').status(204).end();
  }

  if (req.method !== 'GET') {
    return withCORS(req, res).status(405).json({ error: 'Method not allowed' });
  }

  const authResult = verifyAgentApiKey(req);
  if (!authResult.valid) {
    return withCORS(req, res).status(401).json({
      error: 'Unauthorized',
      message: authResult.error,
    });
  }

  try {
    const data = await storage.get('latest-opportunities');

    if (!data) {
      return withCORS(req, res).status(404).json({
        error: 'No opportunity data',
        message: 'No poll data found. The cron job may not have run yet.',
        polledAt: null,
        opportunityCount: 0,
        opportunities: [],
      });
    }

    const ageMinutes = Math.round((Date.now() - new Date(data.polledAt).getTime()) / 60000);

    return withCORS(req, res).status(200).json({
      success: true,
      polledAt: data.polledAt,
      ageMinutes,
      isFresh: ageMinutes < 180,
      opportunityCount: data.opportunityCount ?? 0,
      opportunities: data.opportunities || [],
      subreddits: data.subreddits,
      totalPosts: data.postCount,
    });
  } catch (error) {
    console.error('[v1/opportunities/latest] Error:', error);
    return withCORS(req, res).status(500).json({
      error: 'Failed to fetch opportunities',
      message: error.message,
    });
  }
}

module.exports = handler;
