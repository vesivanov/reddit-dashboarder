const { describe, test, expect, afterEach } = require('@jest/globals');

const { buildReviewPlan } = require('../../../lib/services/ai-review');

describe('ai review planner', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('keeps subreddit coverage in the LLM shortlist', () => {
    jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-03-14T12:00:00Z').getTime());

    const posts = [
      { id: 'seo-1', title: 'SEO consultant needed for traffic drop', subreddit: 'seo', selftext: 'Need SEO help for our B2B SaaS site', score: 120, num_comments: 18, created_utc: 1763448000 },
      { id: 'seo-2', title: 'Best SEO agency for technical migration', subreddit: 'seo', selftext: 'Looking for recommendations', score: 95, num_comments: 15, created_utc: 1763444400 },
      { id: 'seo-3', title: 'Need SEO software recommendation', subreddit: 'seo', selftext: 'Comparing vendors now', score: 90, num_comments: 14, created_utc: 1763440800 },
      { id: 'seo-4', title: 'SEO tool comparison for in-house team', subreddit: 'seo', selftext: 'What should we buy?', score: 80, num_comments: 12, created_utc: 1763437200 },
      { id: 'sb-1', title: 'Traffic dropped after site relaunch and we need help fast', subreddit: 'smallbusiness', selftext: 'Our company needs a consultant before launch next week', score: 40, num_comments: 20, created_utc: 1763451600 },
    ];

    const plan = buildReviewPlan({
      posts,
      goalText: 'find seo consulting leads',
      userContext: 'prioritize companies looking for agencies or consultants',
      llmLimit: 4,
    });

    const llmIds = new Set(plan.llmEntries.map((entry) => entry.post.id));
    expect(llmIds.size).toBe(4);
    expect(llmIds.has('sb-1')).toBe(true);
  });

  test('includes fresh high-intent posts even when lexical overlap is weak', () => {
    jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-03-14T12:00:00Z').getTime());

    const posts = [
      { id: 'weak-keyword', title: 'SEO advice thread', subreddit: 'seo', selftext: 'General discussion for beginners', score: 6, num_comments: 1, created_utc: 1763280000 },
      { id: 'buyer-intent', title: 'Need someone to fix a traffic drop before launch', subreddit: 'marketing', selftext: 'Our startup lost demo volume and we need a consultant asap. What service should we hire?', score: 85, num_comments: 26, created_utc: 1763456400 },
      { id: 'noise-1', title: 'Favorite browser extensions', subreddit: 'productivity', selftext: 'Just curious', score: 22, num_comments: 3, created_utc: 1763452800 },
      { id: 'noise-2', title: 'How do I learn SEO?', subreddit: 'marketing', selftext: 'I am a student and want courses', score: 15, num_comments: 4, created_utc: 1763452800 },
    ];

    const plan = buildReviewPlan({
      posts,
      goalText: 'find SEO consulting opportunities',
      userContext: 'look for businesses with active problems, not learners',
      llmLimit: 2,
    });

    const llmIds = new Set(plan.llmEntries.map((entry) => entry.post.id));
    expect(llmIds.has('buyer-intent')).toBe(true);
  });
});
