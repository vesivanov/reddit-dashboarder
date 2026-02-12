// Reddit background poller for automated lead fetching
// Fetches posts, runs AI ranking, stores in Vercel KV

const { KVStorage } = require('./storage/kv');

class RedditPoller {
  constructor() {
    this.kv = new KVStorage();
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
   * Run AI ranking on posts via OpenRouter
   */
  async rankPostsWithAI(posts, goals, context) {
    if (!process.env.SERVER_OPENROUTER_KEY && !process.env.OPENROUTER_API_KEY) {
      console.log('[Poller] No OpenRouter key, skipping AI ranking');
      return posts.map(p => ({ ...p, aiRelevance: 3 }));
    }

    const apiKey = process.env.SERVER_OPENROUTER_KEY || process.env.OPENROUTER_API_KEY;
    const batches = [];
    const batchSize = 10;

    for (let i = 0; i < posts.length; i += batchSize) {
      batches.push(posts.slice(i, i + batchSize));
    }

    const rankedPosts = [];

    for (const batch of batches) {
      const postsForPrompt = batch.map((p, idx) => 
        `[${idx + 1}] Title: ${p.title}\nText: ${(p.selftext || '').slice(0, 200)}`
      ).join('\n\n');

      const prompt = `You are analyzing Reddit posts for business lead quality.

Your Goals: ${goals || 'Find SEO/AI search consulting opportunities'}
Context: ${context || 'Looking for people who need help with search optimization, AI search visibility, or technical SEO'}

Rate each post 1-5 for relevance:
- 5 = Perfect match, strong buying intent, ideal client
- 4 = Good match, relevant problem, likely to convert  
- 3 = Somewhat relevant, might need help
- 2 = Weak match, tangential connection
- 1 = Not relevant

Posts to rate:
${postsForPrompt}

Respond ONLY with JSON array of scores: [3, 5, 2, ...]`;

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
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.1,
          }),
        });

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '';
        
        // Extract JSON array from response
        const match = content.match(/\[[\d,\s]+\]/);
        const scores = match ? JSON.parse(match[0]) : batch.map(() => 3);

        batch.forEach((post, idx) => {
          rankedPosts.push({
            ...post,
            aiRelevance: scores[idx] || 3,
            aiRankedAt: new Date().toISOString(),
          });
        });
      } catch (error) {
        console.error('[Poller] AI ranking error:', error.message);
        batch.forEach(post => rankedPosts.push({ ...post, aiRelevance: 3 }));
      }

      // Small delay between batches
      await new Promise(r => setTimeout(r, 500));
    }

    return rankedPosts;
  }

  /**
   * Identify hot leads from ranked posts
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
      const title = (post.title || '').toLowerCase();
      const selftext = (post.selftext || '').toLowerCase();
      const combined = title + ' ' + selftext;
      
      let score = 0;
      const signals = [];
      
      // AI relevance (trust Ves's UI)
      if (post.aiRelevance >= 4) {
        score += post.aiRelevance * 3;
        signals.push(`AI relevance: ${post.aiRelevance}/5`);
      }
      
      // Intent keywords
      const matchedIntent = intentKeywords.filter(kw => combined.includes(kw));
      if (matchedIntent.length > 0) {
        score += matchedIntent.length * 2;
        signals.push(`intent: ${matchedIntent.slice(0, 2).join(', ')}`);
      }
      
      // Service match
      const matchedService = serviceKeywords.filter(kw => combined.includes(kw));
      if (matchedService.length > 0) {
        score += matchedService.length * 2;
        signals.push(`service: ${matchedService.slice(0, 2).join(', ')}`);
      }
      
      // Freshness
      const ageHours = (nowSeconds - (post.created_utc || 0)) / 3600;
      if (ageHours < 24) {
        score += 4;
        signals.push('fresh (<24h)');
      } else if (ageHours < 48) {
        score += 2;
        signals.push('recent (<48h)');
      }
      
      // Engagement
      if (post.score > 20) {
        score += 2;
      }
      if (post.num_comments > 5) {
        score += 2;
      }

      if (score >= 12 || post.aiRelevance >= 4) {
        hotLeads.push({
          id: post.id,
          title: post.title,
          subreddit: post.subreddit,
          score: post.score,
          num_comments: post.num_comments,
          created_utc: post.created_utc,
          age_hours: Math.round(ageHours * 10) / 10,
          url: post.reddit_url,
          aiRelevance: post.aiRelevance,
          hot_score: score,
          signals: signals.slice(0, 4),
        });
      }
    }

    return hotLeads.sort((a, b) => b.hot_score - a.hot_score).slice(0, 15);
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
      };

      await this.kv.set('latest-leads', pollData, 7 * 24 * 60 * 60); // 7 days TTL

      console.log(`[Poller] Complete. ${hotLeads.length} hot leads stored.`);
      return pollData;
    } catch (error) {
      console.error('[Poller] Fatal error:', error);
      throw error;
    }
  }
}

module.exports = { RedditPoller };
