// Agent-Friendly Digest Endpoint
// Returns high-priority Reddit posts for automated monitoring
// 
// Usage: GET /api/reddit/digest?subs=X&threshold=4&goals=...&format=json
// Auth: Bearer token via DIGEST_API_KEY env var
//
// Environment variables:
//   DIGEST_API_KEY        - Required: Bearer token for auth
//   REDDIT_REFRESH_TOKEN  - Required: Server-side Reddit refresh token
//   DIGEST_SUBREDDITS     - Optional: Default subreddits (comma-separated)
//   DIGEST_GOALS          - Optional: Default AI ranking goals
//   DIGEST_CONTEXT        - Optional: Default AI context/clarifiers
//   DIGEST_THRESHOLD      - Optional: Default score threshold (default: 4)

const { withCORS } = require('../../cors');
const { parseRequest, getQueryValue } = require('../../request-utils');
const { getRefreshToken } = require('../../token-store');
const { readSignedCookie } = require('../../cookies');

const TOKEN_ENDPOINT = 'https://www.reddit.com/api/v1/access_token';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const USER_AGENT = process.env.REDDIT_USER_AGENT || DEFAULT_UA;

// Import buildBatches from ai-rank for consistent batching
const { buildBatches, clampScore } = require('./ai-rank');

// Import enhanced scoring engine
const {
  preFilterPosts,
  calculateCompositeScore,
  deduplicatePosts,
  sortByPriority,
  generateScoringPrompt,
  calculateSavings,
} = require('../../scoring-engine');

// ============ Auth ============

function verifyApiKey(req) {
  const apiKey = process.env.DIGEST_API_KEY;
  if (!apiKey) {
    return { valid: false, error: 'DIGEST_API_KEY not configured on server' };
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

// ============ Reddit Token Management ============

let cachedAccessToken = null;
let tokenExpiresAt = 0;

async function getAccessToken() {
  // Return cached token if still valid (with 60s buffer)
  if (cachedAccessToken && Date.now() < tokenExpiresAt - 60000) {
    return cachedAccessToken;
  }
  
  // Get refresh token from KV or env var
  const { token: refreshToken, source } = await getRefreshToken();
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  
  if (!refreshToken) {
    throw new Error('No Reddit refresh token found. Either configure Vercel KV and authenticate via browser, or set REDDIT_REFRESH_TOKEN env var.');
  }
  
  console.log(`[digest] Using refresh token from: ${source}`);
  if (!clientId || !clientSecret) {
    throw new Error('Reddit OAuth credentials not configured');
  }
  
  const form = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
  
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  
  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT,
    },
    body: form.toString(),
  });
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Reddit token refresh failed: ${response.status} ${text.slice(0, 200)}`);
  }
  
  const data = await response.json();
  cachedAccessToken = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in || 3600) * 1000;
  
  // If Reddit returned a new refresh token, log it (admin should update env var)
  if (data.refresh_token && data.refresh_token !== refreshToken) {
    console.warn('[digest] Reddit returned new refresh token - update REDDIT_REFRESH_TOKEN env var');
  }
  
  return cachedAccessToken;
}

// ============ Reddit Fetching ============

async function fetchRedditPosts(subreddits, { days = 1, limit = 100, maxPages = 5 } = {}) {
  const token = await getAccessToken();
  const cutoff = Math.floor(Date.now() / 1000) - days * 86400;
  const results = [];
  
  for (const sub of subreddits) {
    try {
      const posts = await fetchSubredditPosts(sub, token, { cutoff, limit, maxPages });
      results.push({ subreddit: sub, posts, error: null });
    } catch (err) {
      console.error(`[digest] Error fetching r/${sub}:`, err.message);
      results.push({ subreddit: sub, posts: [], error: err.message });
    }
    
    // Small delay between subreddits
    if (subreddits.indexOf(sub) < subreddits.length - 1) {
      await sleep(300);
    }
  }
  
  return results;
}

async function fetchSubredditPosts(sub, token, { cutoff, limit, maxPages }) {
  const collected = [];
  let after = '';
  let page = 0;
  
  while (page < maxPages) {
    const url = `https://oauth.reddit.com/r/${encodeURIComponent(sub)}/new.json?limit=${limit}${after ? `&after=${after}` : ''}&raw_json=1`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
    });
    
    if (!response.ok) {
      throw new Error(`Reddit API ${response.status}`);
    }
    
    const data = await response.json();
    const posts = normalizePosts(data);
    
    if (!posts.length) break;
    
    for (const p of posts) {
      if ((p.created_utc || 0) >= cutoff) {
        collected.push(p);
      }
    }
    
    after = data?.data?.after || '';
    page++;
    
    const oldest = posts[posts.length - 1];
    if (!after || !oldest || oldest.created_utc < cutoff) break;
    
    await sleep(250);
  }
  
  return collected;
}

function normalizePosts(data) {
  const children = data?.data?.children || [];
  return children.map(child => {
    const post = child.data || {};
    return {
      id: post.id,
      subreddit: post.subreddit,
      title: post.title,
      selftext: post.selftext || '',
      author: post.author,
      url: `https://www.reddit.com${post.permalink}`,
      external_url: post.url || '',
      domain: post.domain,
      score: Number(post.score) || 0,
      num_comments: Number(post.num_comments) || 0,
      created_utc: post.created_utc,
      link_flair_text: post.link_flair_text || '',
    };
  });
}

// ============ AI Ranking ============

// Fallback models to try if primary fails
const FALLBACK_MODELS = [
  'google/gemini-2.5-flash',
  'qwen/qwen-2.5-72b-instruct',
  'meta-llama/llama-3.3-70b-instruct',
];

async function rankPosts(posts, { goals, context, model, req }) {
  if (!posts.length) return { scores: {}, metadata: {}, error: null };

  // Priority: cookie (user's key) > env var (server key)
  const cookieApiKey = req ? readSignedCookie(req, 'openrouter_key') : null;
  const apiKey = cookieApiKey || process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY not configured. Set env var or save key in settings.');
  }

  const batches = buildBatches(posts);
  const allScores = {};
  const allMetadata = {};
  let lastError = null;
  let modelsToTry = [model, ...FALLBACK_MODELS.filter(m => m !== model)];
  let currentModelIndex = 0;
  let modelUsed = null;

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    let batchSuccess = false;

    // Try each model until one works
    while (!batchSuccess && currentModelIndex < modelsToTry.length) {
      const currentModel = modelsToTry[currentModelIndex];
      try {
        if (process.env.NODE_ENV !== 'production') {
          console.log(`[digest] Trying model ${currentModelIndex + 1}/${modelsToTry.length}: ${currentModel}`);
        }

        const result = await callOpenRouterForRanking(batch, { goals, context, apiKey, model: currentModel });

        for (const [postId, score] of Object.entries(result.scores)) {
          allScores[postId] = score;
        }
        for (const [postId, meta] of Object.entries(result.metadata || {})) {
          allMetadata[postId] = meta;
        }

        batchSuccess = true;
        modelUsed = currentModel;
      } catch (err) {
        console.error(`[digest] Model ${currentModel} failed:`, err.message);
        lastError = err.message;
        currentModelIndex++; // Try next model
      }
    }

    if (!batchSuccess) {
      // All models failed for this batch
      console.error(`[digest] All models failed for batch ${i + 1}`);
      for (const p of batch) {
        allScores[p.id] = null;
      }
    }

    if (i < batches.length - 1) {
      await sleep(500);
    }
  }

  return { scores: allScores, metadata: allMetadata, error: lastError, modelUsed };
}

async function callOpenRouterForRanking(postsBatch, { goals, context, apiKey, model }) {
  // Use enhanced prompt for better lead detection
  const system = generateScoringPrompt(goals, context);

  const normalizedBatch = postsBatch.map(p => ({
    id: String(p.id),
    title: (p.title || '').slice(0, 180),
    subreddit: (p.subreddit || '').slice(0, 80),
    text: (p.selftext || p.text || '').slice(0, 300),
    flair: (p.link_flair_text || p.flair || '').slice(0, 50),
    score: p.score || 0,
    num_comments: p.num_comments || 0,
  }));

  const user = [
    'Posts JSON:',
    JSON.stringify(normalizedBatch),
    '',
    'Score EVERY postId. Respond only with the JSON array.',
  ].join('\n');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.OPENROUTER_REFERER || 'https://reddit-dashboarder.vercel.app',
        'X-Title': 'Reddit Dashboarder Digest',
      },
      body: JSON.stringify({
        model: model,
        temperature: 0,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });

    if (!response.ok) {
      const txt = await response.text();
      throw new Error(`OpenRouter ${response.status}: ${txt.slice(0, 200)}`);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error('No content in model response');

    const match = content.match(/```(?:json)?\s*(\[[\s\S]*\])\s*```/) || content.match(/(\[[\s\S]*\])/);
    const jsonStr = match ? match[1] : content;
    const arr = JSON.parse(jsonStr);

    if (!Array.isArray(arr)) throw new Error('Model did not return an array');

    const scores = {};
    const metadata = {};

    for (const item of arr) {
      if (!item || !item.postId) continue;
      const postId = String(item.postId);
      scores[postId] = clampScore(item.score);
      if (item.confidence || item.reason) {
        metadata[postId] = {
          confidence: item.confidence || 'unknown',
          reason: item.reason || '',
        };
      }
    }

    return { scores, metadata };
  } finally {
    clearTimeout(timeout);
  }
}

// ============ Helpers ============

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function clampInt(value, min, max, fallback) {
  const parsed = parseInt(value || '', 10);
  if (Number.isFinite(parsed)) {
    return Math.max(min, Math.min(max, parsed));
  }
  return fallback;
}

// ============ Main Handler ============

async function handler(req, res) {
  const startTime = Date.now();
  const isDev = process.env.NODE_ENV !== 'production';

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return withCORS(req, res).status(204).end();
  }

  if (req.method !== 'GET') {
    return withCORS(req, res).status(405).json({ error: 'Method not allowed' });
  }

  // Verify API key
  const authResult = verifyApiKey(req);
  if (!authResult.valid) {
    return withCORS(req, res).status(401).json({ error: authResult.error });
  }

  try {
    const { query } = parseRequest(req);
    
    // Parse parameters with defaults from env vars
    const subsParam = getQueryValue(query, 'subs', process.env.DIGEST_SUBREDDITS || '');
    const goalsParam = getQueryValue(query, 'goals', process.env.DIGEST_GOALS || '');
    const contextParam = getQueryValue(query, 'context', process.env.DIGEST_CONTEXT || '');
    const thresholdParam = getQueryValue(query, 'threshold', process.env.DIGEST_THRESHOLD || '4');
    const formatParam = getQueryValue(query, 'format', 'json');
    const daysParam = getQueryValue(query, 'days', '1');
    const modelParam = getQueryValue(query, 'model', process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash');
    
    // Fallback models to try if primary fails (for resilience)
    const fallbackModels = [
      'google/gemini-2.5-flash',
      'qwen/qwen-2.5-72b-instruct',
      'meta-llama/llama-3.3-70b-instruct',
    ];

    // Validate required params
    const subreddits = subsParam.split(',').map(s => s.trim()).filter(Boolean);
    if (!subreddits.length) {
      return withCORS(req, res).status(400).json({
        error: 'Missing subreddits',
        message: 'Provide subs param or set DIGEST_SUBREDDITS env var',
      });
    }

    if (!goalsParam.trim()) {
      return withCORS(req, res).status(400).json({
        error: 'Missing goals',
        message: 'Provide goals param or set DIGEST_GOALS env var',
      });
    }

    const threshold = clampInt(thresholdParam, 0, 5, 4);
    const days = clampInt(daysParam, 1, 7, 1);

    if (isDev) {
      console.log('[digest] Request:', { subreddits, threshold, days, model: modelParam });
    }

    // Step 1: Fetch posts
    const fetchResults = await fetchRedditPosts(subreddits, { days });
    let allPosts = fetchResults.flatMap(r => r.posts);
    const originalCount = allPosts.length;

    // Step 2: Pre-filter low-engagement posts (saves API costs)
    allPosts = preFilterPosts(allPosts);
    const filteredCount = allPosts.length;
    const savings = calculateSavings(originalCount, filteredCount);

    // Step 3: Deduplicate across subreddits
    allPosts = deduplicatePosts(allPosts);
    const dedupedCount = allPosts.length;

    if (isDev) {
      console.log(`[digest] Fetched ${originalCount}, filtered to ${filteredCount} (${savings.percent}% saved), deduped to ${dedupedCount}`);
    }

    if (!allPosts.length) {
      return withCORS(req, res).status(200).json({
        highPriorityPosts: [],
        stats: {
          subreddits: subreddits.length,
          total: originalCount,
          filtered: filteredCount,
          deduped: dedupedCount,
          scored: 0,
          highPriority: 0,
          threshold,
          apiSavingsPercent: savings.percent,
          durationMs: Date.now() - startTime,
        },
        fetchErrors: fetchResults.filter(r => r.error).map(r => ({ subreddit: r.subreddit, error: r.error })),
      });
    }

    // Step 4: AI rank posts
    const { scores, metadata, error: aiError, modelUsed } = await rankPosts(allPosts, {
      goals: goalsParam,
      context: contextParam,
      model: modelParam,
      req,
    });

    // Step 5: Calculate composite scores (AI + engagement + time + subreddit weight)
    const compositeScores = {};
    for (const post of allPosts) {
      const aiScore = scores[post.id];
      if (aiScore !== null && aiScore !== undefined) {
        compositeScores[post.id] = calculateCompositeScore(aiScore, post, metadata[post.id]);
      }
    }

    // Step 6: Filter by threshold and sort
    let highPriorityPosts = allPosts
      .filter(p => (compositeScores[p.id] || 0) >= threshold)
      .map(p => ({
        id: p.id,
        title: p.title,
        subreddit: p.subreddit,
        author: p.author,
        url: p.url,
        score: compositeScores[p.id],
        aiScore: scores[p.id],
        redditScore: p.score,
        numComments: p.num_comments,
        ageHours: Math.round((Date.now() / 1000 - p.created_utc) / 3600),
        reason: metadata[p.id]?.reason || '',
        confidence: metadata[p.id]?.confidence || 'unknown',
        flair: p.link_flair_text,
        preview: (p.selftext || '').slice(0, 200),
      }));
    
    // Sort using composite scores
    highPriorityPosts = sortByPriority(highPriorityPosts.map(p => ({
      ...p,
      created_utc: allPosts.find(ap => ap.id === p.id)?.created_utc
    })), compositeScores).map(({ created_utc, ...rest }) => rest);

    const scoredCount = Object.values(scores).filter(s => s !== null).length;
    const fetchErrors = fetchResults.filter(r => r.error).map(r => ({ subreddit: r.subreddit, error: r.error }));

    // Calculate subreddit quality analysis
    const subredditAnalysis = {};
    for (const sub of subreddits) {
      const subPosts = allPosts.filter(p => p.subreddit?.toLowerCase() === sub.toLowerCase());
      const subScores = subPosts.map(p => compositeScores[p.id]).filter(s => s !== null && s !== undefined);
      const avgScore = subScores.length > 0 ? subScores.reduce((a, b) => a + b, 0) / subScores.length : 0;
      const highQualityCount = subScores.filter(s => s >= 4).length;
      
      subredditAnalysis[sub] = {
        postCount: subPosts.length,
        avgScore: Math.round(avgScore * 10) / 10,
        highQualityCount,
        leadQuality: avgScore >= 4 ? 'excellent' : avgScore >= 3 ? 'good' : avgScore >= 2 ? 'fair' : 'poor',
      };
    }

    // Build expanded response
    const response = {
      // Full config that was used
      config: {
        subreddits,
        aiRanking: {
          enabled: true,
          goals: goalsParam,
          context: contextParam,
          model: modelParam,
          threshold,
        },
        filters: {
          days,
          minEngagement: {
            score: 3,
            comments: 1,
            combined: 5,
          },
        },
      },
      
      // All posts with full scoring breakdown
      posts: highPriorityPosts.map(p => ({
        id: p.id,
        title: p.title,
        subreddit: p.subreddit,
        author: p.author,
        content: {
          preview: p.preview,
          flair: p.flair,
        },
        engagement: {
          upvotes: p.redditScore,
          comments: p.numComments,
        },
        timing: {
          ageHours: p.ageHours,
        },
        scoring: {
          composite: p.score,
          ai: p.aiScore,
          confidence: p.confidence,
          reason: p.reason,
        },
        urls: {
          reddit: p.url,
        },
      })),
      
      // Analysis & insights
      analysis: {
        subredditQuality: subredditAnalysis,
        suggestions: {
          addSubreddits: [],
          tightenFilters: threshold < 4 ? 'Consider raising threshold to 4+ for higher quality leads' : null,
          opportunities: [],
        },
        patterns: {
          bestPerformingSubreddits: Object.entries(subredditAnalysis)
            .sort((a, b) => b[1].avgScore - a[1].avgScore)
            .slice(0, 3)
            .map(([sub, data]) => ({ subreddit: sub, ...data })),
        },
      },
      
      // Legacy fields for backwards compatibility
      highPriorityPosts,
      scoring: {
        method: 'composite',
        factors: ['ai_score', 'engagement', 'recency', 'subreddit_quality', 'confidence'],
        description: 'AI score weighted by engagement, freshness, and subreddit quality',
      },
      stats: {
        subreddits: subreddits.length,
        totalFetched: originalCount,
        prefiltered: filteredCount,
        deduplicated: dedupedCount,
        apiSavingsPercent: savings.percent,
        total: allPosts.length,
        scored: scoredCount,
        highPriority: highPriorityPosts.length,
        threshold,
        model: modelParam,
        modelUsed: modelUsed || modelParam,
        durationMs: Date.now() - startTime,
      },
      ...(fetchErrors.length > 0 && { fetchErrors }),
      ...(aiError && { aiError }),
    };

    // Markdown format option
    if (formatParam === 'markdown' || formatParam === 'md') {
      let md = `# Reddit Digest\n\n`;
      md += `**${highPriorityPosts.length}** high-priority posts (score ≥ ${threshold}) from ${allPosts.length} total\n\n`;
      
      if (highPriorityPosts.length === 0) {
        md += `_No posts met the threshold._\n`;
      } else {
        for (const post of highPriorityPosts) {
          md += `## [${post.score}/5] ${post.title}\n`;
          md += `r/${post.subreddit} • ${post.ageHours}h ago • ${post.redditScore}↑ ${post.numComments}💬\n`;
          if (post.reason) md += `> ${post.reason}\n`;
          md += `${post.url}\n\n`;
        }
      }
      
      res.setHeader('Content-Type', 'text/markdown');
      return withCORS(req, res).status(200).send(md);
    }

    return withCORS(req, res).status(200).json(response);

  } catch (error) {
    console.error('[digest] Error:', error);
    return withCORS(req, res).status(500).json({
      error: 'Internal server error',
      message: error.message,
      durationMs: Date.now() - startTime,
    });
  }
}

module.exports = handler;
