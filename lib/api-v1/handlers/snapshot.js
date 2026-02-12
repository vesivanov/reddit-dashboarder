// Agent API v1 — Snapshot Endpoint
// GET /api/v1/snapshot
// Returns latest posts + config + analysis for AI agents

const { withCORS } = require('../cors');
const { 
  createSuccessResponse, 
  createErrorResponse, 
  ERROR_CODES,
  withTiming,
} = require('./response-helpers');

// Import sync store from sync handler
// Note: In production, this should be Redis/Upstash
const { syncStore } = require('../api-handlers/sync');

/**
 * Verify API key from Authorization header
 */
function verifyApiKey(req) {
  const apiKey = process.env.AGENT_API_KEY;
  
  if (!apiKey) {
    return { valid: false, error: 'AGENT_API_KEY not configured on server' };
  }

  const authHeader = req.headers.authorization || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  
  if (!match) {
    return { valid: false, error: 'Missing or invalid Authorization header. Use: Bearer <token>' };
  }

  const provided = match[1].trim();
  if (provided !== apiKey) {
    return { valid: false, error: 'Invalid API key' };
  }

  return { valid: true };
}

/**
 * Get or create snapshot from sync store
 * For Phase 1, we use the existing sync store
 * Future: Dedicated snapshot storage with versioning
 */
async function getSnapshot(token) {
  const data = syncStore.get(token);
  
  if (!data) {
    return null;
  }
  
  if (data.expiresAt < Date.now()) {
    syncStore.delete(token);
    return null;
  }
  
  return data;
}

/**
 * Calculate analysis metrics from posts
 */
function calculateAnalysis(posts, settings = {}) {
  const nowSeconds = Date.now() / 1000;
  
  // Keywords that indicate buying intent
  const intentKeywords = [
    'looking for', 'need', 'seeking', 'want', 'hire', 'budget', 
    'pay', 'recommend', 'suggestion', 'help with', 'struggling',
    'frustrated', 'urgent', 'asap', 'deadline'
  ];
  
  // Negative keywords (already solved/hired)
  const negativeKeywords = [
    'hired', 'closed', 'found', 'solved', 'thanks', 'thank you',
    'worked with', 'already have'
  ];
  
  // Service keywords for Ves's SEO/AI search consulting
  const serviceKeywords = [
    'seo', 'search', 'ranking', 'google', 'traffic', 'visibility',
    'optimization', 'content', 'marketing', 'agency', 'consultant',
    'expert', 'advice', 'strategy', 'audit', 'keywords',
    'ai search', 'chatgpt', 'perplexity', 'llm'
  ];
  
  const hotLeads = [];
  
  for (const post of (posts || [])) {
    const title = (post.title || '').toLowerCase();
    const selftext = (post.selftext || '').toLowerCase();
    const combined = title + ' ' + selftext;
    
    // Skip if negative keywords present
    const hasNegative = negativeKeywords.some(kw => combined.includes(kw));
    if (hasNegative) continue;
    
    let score = 0;
    const signals = [];
    
    // Intent keywords
    const matchedIntent = intentKeywords.filter(kw => combined.includes(kw));
    if (matchedIntent.length > 0) {
      score += matchedIntent.length * 2;
      signals.push(`intent: ${matchedIntent.slice(0, 2).join(', ')}`);
    }
    
    // Service relevance
    const matchedService = serviceKeywords.filter(kw => combined.includes(kw));
    if (matchedService.length > 0) {
      score += matchedService.length * 3;
      signals.push(`service match: ${matchedService.slice(0, 2).join(', ')}`);
    }
    
    // Freshness
    const ageHours = (nowSeconds - (post.created_utc || 0)) / 3600;
    if (ageHours < 24) {
      score += 5;
      signals.push('fresh (< 24h)');
    } else if (ageHours < 48) {
      score += 2;
      signals.push('recent (< 48h)');
    }
    
    // Engagement velocity
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
    
    // AI relevance score
    if (post.aiRelevance >= 4) {
      score += 5;
      signals.push(`AI relevance: ${post.aiRelevance}/5`);
    }
    
    // Threshold for hot lead (8+)
    if (score >= 8) {
      hotLeads.push({
        postId: post.id,
        title: post.title,
        subreddit: post.subreddit,
        score: post.score,
        numComments: post.num_comments,
        createdUtc: post.created_utc,
        ageHours: Math.round(ageHours * 10) / 10,
        url: post.reddit_url || `https://reddit.com/r/${post.subreddit}/comments/${post.id}`,
        hotScore: score,
        signals: signals.slice(0, 4),
        matchReason: matchedIntent.length > 0 
          ? 'Intent detected + ' + (matchedService.length > 0 ? 'service match' : 'engagement')
          : matchedService.length > 0 
            ? 'Service relevance + engagement'
            : 'High engagement velocity'
      });
    }
  }
  
  // Sort by hot score descending
  hotLeads.sort((a, b) => b.hotScore - a.hotScore);
  
  return {
    hotLeads: hotLeads.slice(0, 20),
    hotLeadCount: hotLeads.length,
    totalPosts: posts?.length || 0,
    lastAnalyzedAt: new Date().toISOString(),
  };
}

/**
 * Normalize post for API response
 */
function normalizePost(post) {
  return {
    id: post.id,
    title: post.title,
    subreddit: post.subreddit,
    author: post.author,
    score: post.score,
    numComments: post.num_comments,
    createdUtc: post.created_utc,
    url: post.reddit_url || `https://reddit.com/r/${post.subreddit}/comments/${post.id}`,
    preview: (post.selftext || '').slice(0, 200),
    aiRelevance: post.aiRelevance || null,
  };
}

/**
 * Main handler
 */
async function handler(req, res) {
  const startTime = Date.now();
  
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return withCORS(req, res).status(204).end();
  }
  
  if (req.method !== 'GET') {
    return withCORS(req, res)
      .status(405)
      .json(createErrorResponse(ERROR_CODES.VALIDATION_ERROR.code, 'Method not allowed'));
  }
  
  // Verify API key
  const authResult = verifyApiKey(req);
  if (!authResult.valid) {
    return withCORS(req, res)
      .status(401)
      .json(createErrorResponse(ERROR_CODES.UNAUTHORIZED.code, authResult.error));
  }
  
  // Get token from query or env default
  const url = new URL(req.url, `http://${req.headers.host}`);
  const token = url.searchParams.get('token') || process.env.DIGEST_SYNC_TOKEN;
  
  if (!token) {
    return withCORS(req, res)
      .status(400)
      .json(createErrorResponse(
        ERROR_CODES.VALIDATION_ERROR.code,
        'Missing sync token',
        [{ field: 'token', message: 'Provide ?token=... or set DIGEST_SYNC_TOKEN env var' }]
      ));
  }
  
  try {
    // Get snapshot from sync store
    const snapshot = await getSnapshot(token);
    
    if (!snapshot) {
      return withCORS(req, res)
        .status(404)
        .json(createErrorResponse(
          ERROR_CODES.NOT_FOUND.code,
          'No snapshot available',
          { message: 'User has not synced data yet. Sync from the frontend first.' }
        ));
    }
    
    // Calculate analysis
    const analysis = calculateAnalysis(snapshot.posts, snapshot.settings);
    
    // Build response
    const data = {
      snapshot: {
        id: `snap_${token.slice(0, 16)}`,
        createdAt: snapshot.syncedAt,
        expiresAt: new Date(snapshot.expiresAt).toISOString(),
      },
      config: {
        subreddits: snapshot.settings?.subreddits || [],
        filters: snapshot.filters || {},
        goals: snapshot.settings?.aiGoals || '',
        threshold: snapshot.settings?.aiThreshold || 3,
        model: snapshot.settings?.openRouterModel || '',
      },
      posts: (snapshot.posts || []).map(normalizePost),
      analysis,
    };
    
    const totalMs = Date.now() - startTime;
    const response = createSuccessResponse(data, { totalMs });
    
    return withCORS(req, res).status(200).json(response);
    
  } catch (error) {
    console.error('[api-v1/snapshot] Error:', error);
    const totalMs = Date.now() - startTime;
    const errorResponse = createErrorResponse(
      ERROR_CODES.INTERNAL_ERROR.code,
      error.message || 'Internal server error'
    );
    errorResponse.timings = { totalMs };
    return withCORS(req, res).status(500).json(errorResponse);
  }
}

module.exports = handler;
