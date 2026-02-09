/**
 * Enhanced Scoring Engine for Reddit Digest
 * 
 * Improvements:
 * 1. Pre-filtering: Skip low-engagement posts before AI scoring
 * 2. Multi-factor scoring: Combine AI + engagement + subreddit weight
 * 3. Better prompt engineering for SEO/AI consulting leads
 * 4. Confidence-based filtering
 * 5. Subreddit quality weights
 * 6. Deduplication across subreddits
 */

// Minimum engagement thresholds to qualify for AI scoring
const ENGAGEMENT_THRESHOLD = {
  score: 3,        // Min Reddit upvotes
  comments: 1,     // Min comments
  combined: 5,     // score + comments * 2
};

// Subreddit quality weights (0.8 - 1.2)
// Higher = more likely to contain quality leads
const SUBREDDIT_WEIGHTS = {
  // SEO-focused (highest value)
  'bigseo': 1.2,
  'seo': 1.15,
  'technicalseo': 1.15,
  
  // Business/entrepreneur (high value)
  'smallbusiness': 1.1,
  'startups': 1.1,
  'entrepreneur': 1.05,
  
  // Marketing (medium-high value)
  'marketing': 1.05,
  'content_marketing': 1.1,
  'digital_marketing': 1.05,
  
  // General (neutral)
  'webdev': 1.0,
  'web_design': 1.0,
  'freelance': 1.0,
};

// Default weight for unknown subreddits
const DEFAULT_SUBREDDIT_WEIGHT = 0.95;

// Time decay factor - newer posts get boost
const HOURS_FOR_FULL_DECAY = 48;

/**
 * Pre-filter posts before AI scoring to save API calls
 */
function preFilterPosts(posts) {
  return posts.filter(post => {
    const engagement = post.score + (post.num_comments * 2);
    
    // Must meet minimum engagement
    if (engagement < ENGAGEMENT_THRESHOLD.combined) return false;
    if (post.score < ENGAGEMENT_THRESHOLD.score && post.num_comments < ENGAGEMENT_THRESHOLD.comments) {
      return false;
    }
    
    // Skip common low-value post types
    const lowValuePatterns = [
      /thank you/i,
      /^\[.+\]\s*$/i,  // Just flair tags
      /moderator/i,
      /weekly thread/i,
      /^poll[:\s]/i,
      /meme/i,
    ];
    
    const text = `${post.title} ${post.selftext || ''}`.toLowerCase();
    if (lowValuePatterns.some(p => p.test(text))) return false;
    
    return true;
  });
}

/**
 * Calculate time decay factor (0.5 - 1.0)
 * Newer posts get higher scores
 */
function calculateTimeDecay(postAgeHours) {
  if (postAgeHours <= 2) return 1.0;
  if (postAgeHours >= HOURS_FOR_FULL_DECAY) return 0.5;
  
  const decay = 1 - (postAgeHours / HOURS_FOR_FULL_DECAY) * 0.5;
  return Math.max(0.5, decay);
}

/**
 * Calculate engagement score (0-1) based on Reddit metrics
 */
function calculateEngagementScore(post) {
  // Logarithmic scale for engagement
  const scoreComponent = Math.log10(Math.max(1, post.score)) / 4;  // ~1.0 at 10k upvotes
  const commentComponent = Math.log10(Math.max(1, post.num_comments)) / 3;  // ~1.0 at 1k comments
  
  // Weight comments more (they indicate discussion/intent)
  const engagement = (scoreComponent * 0.3) + (commentComponent * 0.7);
  return Math.min(1, engagement);
}

/**
 * Get subreddit weight
 */
function getSubredditWeight(subreddit) {
  const key = subreddit.toLowerCase().replace(/[^a-z0-9_]/g, '');
  return SUBREDDIT_WEIGHTS[key] || DEFAULT_SUBREDDIT_WEIGHT;
}

/**
 * Calculate final composite score
 * Combines AI score (0-5), engagement, time decay, and subreddit weight
 */
function calculateCompositeScore(aiScore, post, metadata = {}) {
  if (aiScore === null || aiScore === undefined) return null;
  
  const engagementScore = calculateEngagementScore(post);
  const timeDecay = calculateTimeDecay(
    Math.round((Date.now() / 1000 - post.created_utc) / 3600)
  );
  const subredditWeight = getSubredditWeight(post.subreddit);
  
  // Confidence adjustment - reduce score if AI is uncertain
  const confidenceMultiplier = metadata.confidence === 'high' ? 1.0 :
                               metadata.confidence === 'medium' ? 0.9 :
                               0.8;
  
  // Composite formula:
  // Base: AI score (0-5) * 0.6
  // Engagement bonus: (0-1) * 0.5
  // Time freshness: (0.5-1.0) * 0.2
  // Subreddit quality: (0.8-1.2) * 0.3
  // Confidence: (0.8-1.0)
  
  const baseScore = aiScore * 0.6;
  const engagementBonus = engagementScore * 0.5;
  const freshnessBonus = timeDecay * 0.2;
  const qualityBonus = (subredditWeight - 0.8) * 0.75; // Normalize to ~0-0.3
  
  const rawComposite = baseScore + engagementBonus + freshnessBonus + qualityBonus;
  const finalScore = rawComposite * confidenceMultiplier;
  
  // Clamp to 0-5 and round to 1 decimal
  return Math.round(Math.max(0, Math.min(5, finalScore)) * 10) / 10;
}

/**
 * Deduplicate posts across subreddits
 * Keeps the one with highest engagement
 */
function deduplicatePosts(posts) {
  const seen = new Map();
  
  for (const post of posts) {
    // Create key from normalized title (remove punctuation, lowercase)
    const key = post.title
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60);
    
    if (!seen.has(key)) {
      seen.set(key, post);
    } else {
      const existing = seen.get(key);
      // Keep the one with more engagement
      const existingScore = existing.score + existing.num_comments * 2;
      const newScore = post.score + post.num_comments * 2;
      if (newScore > existingScore) {
        seen.set(key, post);
      }
    }
  }
  
  return Array.from(seen.values());
}

/**
 * Sort posts by priority (score desc, then recency)
 */
function sortByPriority(posts, scores) {
  return posts.sort((a, b) => {
    const scoreDiff = (scores[b.id] || 0) - (scores[a.id] || 0);
    if (Math.abs(scoreDiff) > 0.1) return scoreDiff;
    
    // If scores are close, prefer newer posts
    return b.created_utc - a.created_utc;
  });
}

/**
 * Generate enhanced system prompt for AI scoring
 * Better tailored for SEO/AI consulting lead detection
 */
function generateScoringPrompt(goals, context) {
  const contextLine = context
    ? `Additional context: ${context}`
    : 'No additional context provided.';

  return `You are a lead qualification specialist for an SEO and AI search consulting business.

GOAL: Identify Reddit posts from business owners, marketers, or founders who:
1. Explicitly need SEO help or mention SEO challenges
2. Are struggling with AI/search visibility (ChatGPT, Perplexity, etc.)
3. Want to grow organic traffic but don't know how
4. Are frustrated with current marketing results
5. Are launching new products/services and need visibility

${contextLine}

SCORING RUBRIC (0-5, be strict):

5 - EXCELLENT LEAD (Immediate outreach potential)
- Explicitly asks for SEO/AI search help
- Mentions specific business challenges (low traffic, poor rankings)
- Shows budget awareness or willingness to invest
- Clear intent: "Need help with SEO", "How do I rank better?"

4 - STRONG LEAD (High potential)
- Discusses marketing challenges related to search/AI
- Shows frustration with current agency/tools
- Asks about content strategy, technical SEO, or AI visibility
- Mentions business growth goals

3 - MODERATE LEAD (Some potential)
- Tangentially related to digital marketing
- Discusses website/online presence generally
- Might convert with right approach

2 - WEAK LEAD (Low potential)
- General business discussion
- Not directly related to SEO/AI search
- Informational only

1 - NOISE (Ignore)
- Off-topic, spam, or meta-discussion
- Success stories without problems
- Purely technical programming questions

0 - REJECT (Never show)
- Job postings, hiring requests
- Promotional/spam content
- Violates subreddit rules

CRITICAL RULES:
- Be SCARCE with 4s and 5s. Most posts should be 0-2.
- A post asking "What SEO tool should I use?" = 3
- A post saying "My traffic dropped 50%, need help" = 5
- Job posts must be 0
- Success brags without problems = 1-2

Return ONLY valid JSON:
[{"postId":"abc123","score":4,"confidence":"high","reason":"Business owner describes 50% traffic drop and needs SEO help"}]`;
}

/**
 * Estimate API cost savings from pre-filtering
 */
function calculateSavings(originalCount, filteredCount) {
  const saved = originalCount - filteredCount;
  const percent = originalCount > 0 ? Math.round((saved / originalCount) * 100) : 0;
  return { saved, percent };
}

module.exports = {
  preFilterPosts,
  calculateCompositeScore,
  calculateEngagementScore,
  calculateTimeDecay,
  getSubredditWeight,
  deduplicatePosts,
  sortByPriority,
  generateScoringPrompt,
  calculateSavings,
  SUBREDDIT_WEIGHTS,
  ENGAGEMENT_THRESHOLD,
};