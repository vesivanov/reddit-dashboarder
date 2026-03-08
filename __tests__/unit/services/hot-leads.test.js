const { identifySyncHotLeads, identifyPollerHotLeads } = require('../../../lib/services/hot-leads');

describe('opportunity detection ranking', () => {
  const nowSeconds = Math.floor(Date.now() / 1000);

  test('prioritizes structured opportunity signals for sync hot leads', () => {
    const posts = [
      {
        id: 'lead-1',
        title: 'Need help fixing our SEO traffic drop',
        selftext: 'Looking for someone to help urgently.',
        subreddit: 'seo',
        score: 12,
        num_comments: 6,
        created_utc: nowSeconds - 2 * 3600,
        reddit_url: 'https://reddit.com/r/seo/comments/lead-1',
        aiOpportunity: {
          classification: { type: 'lead' },
          scores: { priority: 0.84 },
          action: { recommended: 'reply_now' },
        },
      },
      {
        id: 'noise-1',
        title: 'Sharing my dashboard design',
        selftext: '',
        subreddit: 'design',
        score: 3,
        num_comments: 0,
        created_utc: nowSeconds - 6 * 3600,
      },
    ];

    const opportunities = identifySyncHotLeads(posts, { aiThreshold: 4 });
    expect(opportunities).toHaveLength(1);
    expect(opportunities[0]).toMatchObject({
      id: 'lead-1',
      opportunity_type: 'lead',
      recommended_action: 'reply_now',
    });
    expect(opportunities[0].opportunity_priority).toBeCloseTo(0.84);
    expect(opportunities[0].signals.join(' | ')).toContain('priority: 84/100');
  });

  test('uses keyword fallback when poller opportunity ranking is unavailable', () => {
    const posts = [
      {
        id: 'fallback-1',
        title: 'Looking for SEO help urgently',
        selftext: 'Need an expert recommendation ASAP.',
        subreddit: 'marketing',
        score: 30,
        num_comments: 10,
        created_utc: nowSeconds - 3 * 3600,
        reddit_url: 'https://reddit.com/r/marketing/comments/fallback-1',
        aiScoreProxy: null,
        aiRankingFailed: true,
      },
    ];

    const opportunities = identifyPollerHotLeads(posts, { aiThreshold: 4 });
    expect(opportunities).toHaveLength(1);
    expect(opportunities[0].signals.join(' | ')).toContain('keyword-only');
    expect(opportunities[0].aiPriority).toBeNull();
  });

  test('prefers opportunity priority over legacy ai score for poller hot leads', () => {
    const posts = [
      {
        id: 'priority-1',
        title: 'Should we hire an SEO consultant?',
        selftext: 'Founder here, considering outside help.',
        subreddit: 'startups',
        score: 8,
        num_comments: 4,
        created_utc: nowSeconds - 2 * 3600,
        reddit_url: 'https://reddit.com/r/startups/comments/priority-1',
        aiScoreProxy: 3,
        aiRankingFailed: false,
        aiOpportunity: {
          classification: { type: 'lead' },
          scores: { priority: 0.81 },
          action: { recommended: 'reply_now' },
        },
      },
    ];

    const opportunities = identifyPollerHotLeads(posts, { aiThreshold: 4 });
    expect(opportunities).toHaveLength(1);
    expect(opportunities[0]).toMatchObject({
      aiPriority: 0.81,
      opportunityType: 'lead',
      recommendedAction: 'reply_now',
    });
    expect(opportunities[0].signals[0]).toBe('priority: 81/100');
  });
});
