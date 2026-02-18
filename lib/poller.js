// Reddit background poller for automated lead fetching
// Fetches posts, runs AI ranking, stores in storage

const storage = require('./storage');
const { generateScoringPrompt } = require('./scoring-engine');

// Max age for a post to be considered a hot lead (48 hours)
const MAX_LEAD_AGE_HOURS = 48;

// Minimum AI relevance score to qualify as a hot lead
// When AI ranking fails, fallback is null (not 3) so this is enforced
const MIN_AI_RELEVANCE = 4;

// Fallback keyword-only threshold (used only when AI ranking is unavailable)
const KEYWORD_FALLBACK_SCORE = 16;

class RedditPoller {
  constructor() {
    this.storage = storage;
    this.REDDIT_API_BASE = 'https://oauth.reddit.com';
  }

  /**
   * Get Reddit access token from refresh token
   */
  async getRedditToken() {
    const response = await fetch('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${process.env.REDDIT_CLIENT_ID}:${process.env.REDDIT_CLIENT_SECRET}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    const data = await response.json();
    return data.access_token;
  }

  /**
   * Fetch posts from a subreddit
   */
  async fetchSubreddit(subreddit, token, limit = 25) {
    const response = await fetch(
      `${this.REDDIT_API_BASE}/r/${subreddit}/new.json?limit=${limit}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'RedditDashboard/1.0',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Reddit API error: ${response.status}`);
    }

    const data = await response.json();
    return data.data.children.map(child => ({
      id: child.data.id,
      title: child.data.title,
      selftext: child.data.selftext,
      subreddit: child.data.subreddit,
      author: child.data.author,
      score: child.data.score,
      num_comments: child.data.num_comments,
      created_utc: child.data.created_utc,
      url: child.data.url,
      reddit_url: `https://reddit.com${child.data.permalink}`,
    }));
  }

  /**
   * Run AI ranking on posts via OpenRouter.
   * Uses the enhanced scoring prompt from scoring-engine.js.
   * Returns posts with aiRelevance set; posts where AI fails get aiRelevance=null.
   */
  async rankPostsWithAI(posts, goals, context) {
    const apiKey = process.env.SERVER_OPENROUTER_KEY || process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      console.warn('[Poller] No OpenRouter key configured — skipping AI ranking. Posts will NOT appear as hot leads unless keyword score is very high.');
      return posts.map(p => ({ ...p, aiRelevance: null, aiRankingFailed: true }));
    }

    const batchSize = 10;
    const batches = [];
    for (let i = 0; i < posts.length; i += batchSize) {
      batches.push(posts.slice(i, i + batchSize));
    }

    // Use the enhanced prompt from scoring-engine.js
    const systemPrompt = generateScoringPrompt(
      goals || 'Find SEO/AI search consulting clients',
      context || 'Helping businesses improve visibility in traditional and AI-powered search (ChatGPT, Perplexity, etc.)'
    );

    const rankedPosts = [];
    let aiSucceeded = false;

    for (const batch of batches) {
      const postsForPrompt = batch.map(p => ({
        id: String(p.id),
        title: (p.title || '').slice(0, 180),
        subreddit: (p.subreddit || '').slice(0, 80),
        text: (p.selftext || '').slice(0, 300),
        score: p.score || 0,
        num_comments: p.num_comments || 0,
      }));

      const userPrompt = `Posts JSON:\n${JSON.stringify(postsForPrompt)}\n\nScore EVERY postId. Respond only with the JSON array:\n[{"postId":"abc","score":4,"confidence":"high","reason":"Brief reason"}]`;

      try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://reddit-dashboarder.vercel.app',
            'X-Title': 'Reddit Dashboard',
          },
          body: JSON.stringify({
            model: 'google/gemini-2.0-flash-exp:free',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            temperature: 0,
          }),
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`OpenRouter ${response.status}: ${errText.slice(0, 200)}`);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '';

        // Parse JSON array from response
        const match = content.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/) || content.match(/(\[[\s\S]*?\])/);
        if (!match) throw new Error('No JSON array in AI response');

        const arr = JSON.parse(match[1]);
        if (!Array.isArray(arr)) throw new Error('AI response is not an array');

        // Build a lookup map from postId -> score
        const scoreMap = {};
        for (const item of arr) {
          if (item && item.postId) {
            scoreMap[String(item.postId)] = Math.max(0, Math.min(5, Number(item.score) || 0));
          }
        }

        aiSucceeded = true;
        batch.forEach(post => {
          rankedPosts.push({
            ...post,
            aiRelevance: scoreMap[String(post.id)] ?? null,
            aiRankedAt: new Date().toISOString(),
          });
        });

      } catch (error) {
        console.error('[Poller] AI ranking batch failed:', error.message);
        batch.forEach(post => rankedPosts.push({ ...post, aiRelevance: null, aiRankingFailed: true }));
      }

      await new Promise(r => setTimeout(r, 500));
    }

    if (!aiSucceeded) {
      console.warn('[Poller] AI ranking failed for all batches. Hot leads will use keyword-only fallback with strict threshold.');
    }

    return rankedPosts;
  }

  /**
   * Identify hot leads from ranked posts.
   * 
   * Rules (in order of priority):
   * 1. HARD AGE CAP: Posts older than MAX_LEAD_AGE_HOURS are NEVER hot leads.
   * 2. If AI ranking worked: include posts with aiRelevance >= MIN_AI_RELEVANCE (4+).
   * 3. If AI ranking failed: use keyword scoring with a strict threshold (no stale posts slip through).
   * 4. Result count is variable — do NOT hardcode to 15. 0 is a valid result on a quiet day.
   */
  identifyHotLeads(posts, settings = {}) {
    const hotLeads = [];
    const nowSeconds = Date.now() / 1000;

    const intentKeywords = [
      'looking for', 'need', 'seeking', 'want', 'hire', 'budget',
      'pay', 'recommend', 'suggestion', 'help with', 'struggling',
      'frustrated', 'urgent', 'asap', 'deadline'
    ];

    const serviceKeywords = [
      'seo', 'search', 'ranking', 'google', 'traffic', 'visibility',
      'optimization', 'content', 'marketing', 'agency', 'consultant',
      'expert', 'advice', 'strategy', 'audit', 'keywords'
    ];

    for (const post of posts) {
      const ageHours = (nowSeconds - (post.created_utc || 0)) / 3600;

      // RULE 1: Hard age cap — never include posts older than MAX_LEAD_AGE_HOURS
      if (ageHours > MAX_LEAD_AGE_HOURS) {
        continue;
      }

      const title = (post.title || '').toLowerCase();
      const selftext = (post.selftext || '').toLowerCase();
      const combined = title + ' ' + selftext;

      let keywordScore = 0;
      const signals = [];

      // Intent keywords
      const matchedIntent = intentKeywords.filter(kw => combined.includes(kw));
      if (matchedIntent.length > 0) {
        keywordScore += matchedIntent.length * 2;
        signals.push(`intent: ${matchedIntent.slice(0, 2).join(', ')}`);
      }

      // Service match
      const matchedService = serviceKeywords.filter(kw => combined.includes(kw));
      if (matchedService.length > 0) {
        keywordScore += matchedService.length * 2;
        signals.push(`service: ${matchedService.slice(0, 2).join(', ')}`);
      }

      // Freshness bonus (within age cap, so always <= 48h)
      if (ageHours < 24) {
        keywordScore += 4;
        signals.push('fresh (<24h)');
      } else {
        keywordScore += 2;
        signals.push('recent (<48h)');
      }

      // Engagement
      if (post.score > 20) keywordScore += 2;
      if (post.num_comments > 5) keywordScore += 2;

      const aiRelevance = post.aiRelevance; // null if AI ranking failed
      const aiWorked = aiRelevance !== null && !post.aiRankingFailed;

      let isHotLead = false;

      if (aiWorked) {
        // RULE 2: AI scored this post — trust the AI score
        if (aiRelevance >= MIN_AI_RELEVANCE) {
          isHotLead = true;
          if (aiRelevance >= 4) signals.unshift(`AI score: ${aiRelevance}/5`);
        }
      } else {
        // RULE 3: AI failed — use strict keyword threshold
        if (keywordScore >= KEYWORD_FALLBACK_SCORE) {
          isHotLead = true;
          signals.unshift('keyword-only (AI unavailable)');
        }
      }

      if (isHotLead) {
        hotLeads.push({
          id: post.id,
          title: post.title,
          subreddit: post.subreddit,
          score: post.score,
          num_comments: post.num_comments,
          created_utc: post.created_utc,
          age_hours: Math.round(ageHours * 10) / 10,
          url: post.reddit_url,
          aiRelevance: aiRelevance,
          aiRankingAvailable: aiWorked,
          hot_score: keywordScore,
          signals: signals.slice(0, 4),
        });
      }
    }

    // Sort by AI score (if available) then freshness
    return hotLeads.sort((a, b) => {
      const aiDiff = (b.aiRelevance || 0) - (a.aiRelevance || 0);
      if (Math.abs(aiDiff) > 0.1) return aiDiff;
      return a.age_hours - b.age_hours; // fresher first
    });
    // NOTE: No .slice(n) here — variable count is intentional.
    // 0 hot leads on a quiet day is correct and expected.
  }

  /**
   * Main poll function - fetch, rank, store
   */
  async poll(subreddits = ['SEO', 'webdev', 'startups', 'freelance'], settings = {}) {
    console.log('[Poller] Starting poll at', new Date().toISOString());

    try {
      const token = await this.getRedditToken();
      const allPosts = [];

      for (const subreddit of subreddits) {
        try {
          const posts = await this.fetchSubreddit(subreddit, token);
          allPosts.push(...posts);
          await new Promise(r => setTimeout(r, 1000)); // Rate limit
        } catch (error) {
          console.error(`[Poller] Error fetching r/${subreddit}:`, error.message);
        }
      }

      console.log(`[Poller] Fetched ${allPosts.length} posts from ${subreddits.length} subreddits`);

      // AI ranking
      const rankedPosts = await this.rankPostsWithAI(
        allPosts,
        settings.aiGoals || 'Find SEO/AI search consulting clients',
        settings.aiContext || 'Helping businesses with AI search visibility'
      );

      // Identify hot leads
      const hotLeads = this.identifyHotLeads(rankedPosts, settings);

      // Store in KV
      const pollData = {
        posts: rankedPosts,
        hotLeads,
        subreddits,
        settings,
        polledAt: new Date().toISOString(),
        postCount: rankedPosts.length,
        hotLeadCount: hotLeads.length,
        aiRankingWorked: rankedPosts.some(p => p.aiRelevance !== null && !p.aiRankingFailed),
      };

      await this.storage.set('latest-leads', pollData, 7 * 24 * 60 * 60); // 7 days TTL

      console.log(`[Poller] Complete. ${hotLeads.length} hot leads stored (age cap: ${MAX_LEAD_AGE_HOURS}h, AI ranking: ${pollData.aiRankingWorked ? 'OK' : 'FAILED - keyword fallback used'}).`);
      return pollData;
    } catch (error) {
      console.error('[Poller] Fatal error:', error);
      throw error;
    }
  }
}

module.exports = { RedditPoller };
