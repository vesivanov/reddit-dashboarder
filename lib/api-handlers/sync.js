// /api/sync - Simple data sync between frontend and AI
// Frontend POSTs current state, AI can GET it anytime
//
// POST /api/sync - Store current frontend data
// GET /api/sync/:token - Retrieve stored data
// DELETE /api/sync/:token - Clear stored data
//
// Data expires after 24h (TTL cleanup)

const { withCORS } = require('../cors');

// Simple in-memory store with TTL
// In production, use Redis or Vercel KV
const syncStore = new Map();
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Identify hot leads from posts based on multiple signals
 * @param {Array} posts - Array of posts
 * @param {Object} settings - User settings including aiGoals
 * @returns {Array} Hot leads with scores and reasons
 */
function identifyHotLeads(posts, settings) {
  const hotLeads = [];
  const nowSeconds = Date.now() / 1000;
  
  // Keywords that indicate buying intent or urgent need
  const intentKeywords = [
    'looking for', 'need', 'seeking', 'want', 'hire', 'budget', 
    'pay', 'recommend', 'suggestion', 'help with', 'struggling',
    'frustrated', 'urgent', 'asap', 'deadline'
  ];
  
  // Industry/service keywords for SEO/AI search consulting
  const serviceKeywords = [
    'seo', 'search', 'ranking', 'google', 'traffic', 'visibility',
    'optimization', 'content', 'marketing', 'agency', 'consultant',
    'expert', 'advice', 'strategy', 'audit', 'keywords'
  ];
  
  for (const post of posts) {
    const title = (post.title || '').toLowerCase();
    const selftext = (post.selftext || '').toLowerCase();
    const combined = title + ' ' + selftext;
    
    let score = 0;
    const signals = [];
    
    // Signal 1: Intent keywords
    const matchedIntent = intentKeywords.filter(kw => combined.includes(kw));
    if (matchedIntent.length > 0) {
      score += matchedIntent.length * 2;
      signals.push(`intent: ${matchedIntent.slice(0, 2).join(', ')}`);
    }
    
    // Signal 2: Service relevance
    const matchedService = serviceKeywords.filter(kw => combined.includes(kw));
    if (matchedService.length > 0) {
      score += matchedService.length * 3;
      signals.push(`service match: ${matchedService.slice(0, 2).join(', ')}`);
    }
    
    // Signal 3: Freshness (posted within last 24h)
    const ageHours = (nowSeconds - (post.created_utc || 0)) / 3600;
    if (ageHours < 24) {
      score += 5;
      signals.push('fresh (< 24h)');
    } else if (ageHours < 48) {
      score += 2;
      signals.push('recent (< 48h)');
    }
    
    // Signal 4: Engagement velocity
    if (ageHours > 0) {
      const upvotesPerHour = (post.score || 0) / ageHours;
      const commentsPerHour = (post.num_comments || 0) / ageHours;
      
      if (upvotesPerHour > 10) {
        score += 3;
        signals.push('high upvote velocity');
      }
      if (commentsPerHour > 2) {
        score += 3;
        signals.push('active discussion');
      }
    }
    
    // Signal 5: High absolute engagement
    if (post.score > 50) {
      score += 2;
    }
    if (post.num_comments > 10) {
      score += 2;
    }
    
    // Signal 6: AI relevance score if available
    if (post.aiRelevance >= 4) {
      score += 5;
      signals.push(`AI relevance: ${post.aiRelevance}/5`);
    }
    
    // Threshold for hot lead
    if (score >= 8) {
      hotLeads.push({
        id: post.id,
        title: post.title,
        subreddit: post.subreddit,
        score: post.score,
        num_comments: post.num_comments,
        created_utc: post.created_utc,
        age_hours: Math.round(ageHours * 10) / 10,
        url: post.reddit_url || `https://reddit.com/r/${post.subreddit}/comments/${post.id}`,
        hot_score: score,
        signals: signals.slice(0, 4), // Top 4 signals
        match_reason: matchedIntent.length > 0 
          ? 'Intent detected + ' + (matchedService.length > 0 ? 'service match' : 'engagement')
          : matchedService.length > 0 
            ? 'Service relevance + engagement'
            : 'High engagement velocity'
      });
    }
  }
  
  // Sort by hot score descending
  hotLeads.sort((a, b) => b.hot_score - a.hot_score);
  
  return hotLeads.slice(0, 20); // Top 20 hot leads max
}

// Cleanup expired entries every hour
setInterval(() => {
  const now = Date.now();
  for (const [token, data] of syncStore.entries()) {
    if (data.expiresAt < now) {
      syncStore.delete(token);
    }
  }
}, 60 * 60 * 1000);

// POST /api/sync - Store frontend data
async function postHandler(req, res) {
  let body;
  if (req.body && typeof req.body === 'object') {
    body = req.body;
  } else {
    try {
      body = await new Promise((resolve, reject) => {
        let data = '';
        req.on('data', chunk => { data += chunk; });
        req.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
        req.on('error', reject);
      });
    } catch (parseError) {
      return withCORS(req, res).status(400).json({ error: 'Invalid JSON body' });
    }
  }

  const { token, posts, settings, filters, timestamp } = body;

  if (!token || typeof token !== 'string') {
    return withCORS(req, res).status(400).json({ 
      error: 'token is required',
      message: 'Provide a unique token to identify this sync session'
    });
  }

  // Store the data with TTL
  const now = Date.now();
  syncStore.set(token, {
    token,
    posts: posts || [],
    settings: settings || {},
    filters: filters || {},
    timestamp: timestamp || new Date().toISOString(),
    syncedAt: new Date(now).toISOString(),
    expiresAt: now + DEFAULT_TTL_MS,
  });

  return withCORS(req, res).status(200).json({
    success: true,
    token,
    postCount: (posts || []).length,
    expiresAt: new Date(now + DEFAULT_TTL_MS).toISOString(),
  });
}

// GET /api/sync/:token - Retrieve stored data
async function getHandler(req, res, token) {
  const data = syncStore.get(token);

  if (!data) {
    return withCORS(req, res).status(404).json({
      error: 'Sync data not found',
      message: 'Token may have expired or data was never synced'
    });
  }

  if (data.expiresAt < Date.now()) {
    syncStore.delete(token);
    return withCORS(req, res).status(410).json({
      error: 'Sync data expired',
      expiredAt: new Date(data.expiresAt).toISOString()
    });
  }

  // Identify hot leads for AI analysis
  const hotLeads = identifyHotLeads(data.posts || [], data.settings || {});

  return withCORS(req, res).status(200).json({
    success: true,
    token: data.token,
    syncedAt: data.syncedAt,
    expiresAt: new Date(data.expiresAt).toISOString(),
    data: {
      posts: data.posts,
      settings: data.settings,
      filters: data.filters,
      timestamp: data.timestamp,
    },
    analysis: {
      hotLeads,
      totalPosts: (data.posts || []).length,
      hotLeadCount: hotLeads.length,
    },
  });
}

// DELETE /api/sync/:token - Clear stored data
async function deleteHandler(req, res, token) {
  const existed = syncStore.has(token);
  if (existed) {
    syncStore.delete(token);
  }

  return withCORS(req, res).status(200).json({
    success: true,
    deleted: existed,
  });
}

// Main router
module.exports = async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return withCORS(req, res, 'GET, POST, DELETE, OPTIONS').status(204).end();
  }

  const url = req.url || '';
  const match = url.match(/^\/api\/sync(?:\/(\w+))?$/);

  if (!match) {
    return withCORS(req, res).status(404).json({ error: 'Not found' });
  }

  const token = match[1];

  try {
    if (!token) {
      // /api/sync
      if (req.method === 'POST') {
        return await postHandler(req, res);
      }
      return withCORS(req, res).status(405).json({ error: 'Method not allowed' });
    }

    // /api/sync/:token
    switch (req.method) {
      case 'GET':
        return await getHandler(req, res, token);
      case 'DELETE':
        return await deleteHandler(req, res, token);
      default:
        return withCORS(req, res).status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('[sync] Error:', error);
    return withCORS(req, res).status(500).json({
      error: 'Internal server error',
      message: error.message,
    });
  }
};
