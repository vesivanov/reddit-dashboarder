// Reddit background poller for automated opportunity fetching
// Fetches posts, runs opportunity ranking, stores in storage

const storage = require('./storage');
const { callOpenRouter, buildBatches, normalizeScoringConfig } = require('./services/ai-ranking');
const { identifyPollerHotLeads } = require('./services/hot-leads');

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
   * Run opportunity ranking on posts via OpenRouter.
   * Uses the shared scoring configuration and prompt builder.
   * Returns posts with structured opportunity data and score proxies.
   */
  async rankPostsWithAI(posts, settings = {}) {
    const apiKey = process.env.SERVER_OPENROUTER_KEY || process.env.OPENROUTER_API_KEY;
    const model = settings.openRouterModel || process.env.POLLER_OPENROUTER_MODEL || 'google/gemini-2.0-flash-exp:free';
    const userGoals = settings.aiGoals || settings.goals || 'Find SEO/AI search consulting clients';
    const userContext = settings.aiContext || 'Helping businesses improve visibility in traditional and AI-powered search (ChatGPT, Perplexity, etc.)';
    const scoringConfig = normalizeScoringConfig(settings.scoringConfig);

    if (!apiKey) {
      console.warn('[Poller] No OpenRouter key configured — skipping opportunity ranking. Posts will only surface via keyword fallback.');
      return posts.map(p => ({ ...p, aiScoreProxy: null, aiRankingFailed: true }));
    }

    const batches = [];
    for (let i = 0; i < posts.length; i += 10) {
      batches.push(posts.slice(i, i + 10));
    }

    const rankedPosts = [];
    let aiSucceeded = false;

    for (const batch of batches) {
      try {
        const promptBatch = buildBatches(batch, {
          maxPostsPerBatch: 10,
          maxTokensPerBatch: Number.MAX_SAFE_INTEGER,
          perPostTextLimit: 300,
        }).flat();

        const result = await callOpenRouter({
          apiKey,
          model,
          userGoals,
          userContext,
          scoringConfig,
          postsBatch: promptBatch,
          temperature: 0,
        });

        aiSucceeded = true;
        batch.forEach(post => {
          const postId = String(post.id);
          const opportunity = result.opportunities?.get(postId) || null;
          rankedPosts.push({
            ...post,
            aiScoreProxy: result.scores.get(postId) ?? null,
            aiMetadata: result.metadata.get(postId) || null,
            aiOpportunity: opportunity,
            aiPriority: opportunity?.scores?.priority ?? null,
            aiRankedAt: new Date().toISOString(),
          });
        });

      } catch (error) {
        console.error('[Poller] AI ranking batch failed:', error.message);
        batch.forEach(post => rankedPosts.push({ ...post, aiScoreProxy: null, aiRankingFailed: true }));
      }

      await new Promise(r => setTimeout(r, 500));
    }

    if (!aiSucceeded) {
      console.warn('[Poller] AI ranking failed for all batches. Hot leads will use keyword-only fallback with strict threshold.');
    }

    return rankedPosts;
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

      // Opportunity ranking
      const rankedPosts = await this.rankPostsWithAI(allPosts, settings);

      // Identify top opportunities
      const opportunities = identifyPollerHotLeads(rankedPosts, settings);

      // Store in KV
      const pollData = {
        posts: rankedPosts,
        opportunities,
        opportunityCount: opportunities.length,
        subreddits,
        settings,
        polledAt: new Date().toISOString(),
        postCount: rankedPosts.length,
        aiRankingWorked: rankedPosts.some(p => (p.aiScoreProxy !== null || p.aiPriority !== null) && !p.aiRankingFailed),
      };

      await this.storage.set('latest-opportunities', pollData, 7 * 24 * 60 * 60); // 7 days TTL

      console.log(`[Poller] Complete. ${opportunities.length} opportunities stored (ranking: ${pollData.aiRankingWorked ? 'OK' : 'FAILED - keyword fallback used'}).`);
      return pollData;
    } catch (error) {
      console.error('[Poller] Fatal error:', error);
      throw error;
    }
  }
}

module.exports = { RedditPoller };
