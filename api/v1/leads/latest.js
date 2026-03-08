// /api/v1/leads/latest - Get latest polled leads
// Protected by AGENT_API_KEY because lead output can be sensitive.
// GET /api/v1/leads/latest

const { withCORS } = require('../../../lib/cors');
const { verifyAgentApiKey } = require('../../../lib/api-v1/auth');
const storage = require('../../../lib/storage');

async function handler(req, res) {
  // Handle CORS
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
    const data = await storage.get('latest-leads');

    if (!data) {
      return withCORS(req, res).status(404).json({
        error: 'No leads data',
        message: 'No poll data found. The cron job may not have run yet.',
        polledAt: null,
        hotLeadCount: 0,
        hotLeads: [],
      });
    }

    const ageMinutes = Math.round((Date.now() - new Date(data.polledAt).getTime()) / 60000);

    return withCORS(req, res).status(200).json({
      success: true,
      polledAt: data.polledAt,
      ageMinutes,
      isFresh: ageMinutes < 180, // Fresh if < 3 hours
      hotLeadCount: data.hotLeadCount,
      hotLeads: data.hotLeads,
      subreddits: data.subreddits,
      totalPosts: data.postCount,
    });
  } catch (error) {
    console.error('[v1/leads/latest] Error:', error);
    return withCORS(req, res).status(500).json({
      error: 'Failed to fetch leads',
      message: error.message,
    });
  }
}

module.exports = handler;
