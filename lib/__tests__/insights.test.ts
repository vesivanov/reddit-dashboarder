import { computeInsights, DashboardFilters, RawRedditPost, transformPosts } from '../data/transformPosts';

describe('transformPosts insights', () => {
  const basePosts: RawRedditPost[] = [
    {
      id: '1',
      subreddit: 'technology',
      title: 'AI beats benchmark',
      score: 500,
      created_utc: 1_700_000_000,
      previous_score: 420,
      selftext: 'Breakthrough in machine learning research',
    },
    {
      id: '2',
      subreddit: 'technology',
      title: 'New smartphone review',
      score: 320,
      previous_score: 300,
      created_utc: 1_700_020_000,
      selftext: 'Detailed comparison of flagship phones',
    },
    {
      id: '3',
      subreddit: 'webdev',
      title: 'TypeScript tips for React developers',
      score: 220,
      previous_score: 100,
      created_utc: 1_700_030_000,
      selftext: 'Learn how to structure hooks and context',
    },
    {
      id: '4',
      subreddit: 'webdev',
      title: 'CSS tricks for responsive dashboards',
      score: 150,
      previous_score: 149,
      created_utc: 1_699_800_000,
      selftext: 'Grid layout inspiration for insights panels',
    },
    {
      id: '5',
      subreddit: 'reactjs',
      title: 'Context vs Redux in modern React',
      score: 180,
      previous_score: 90,
      created_utc: 1_700_050_000,
      selftext: 'How to pick the best state management strategy',
    },
  ];

  it('sorts posts by score delta and honours subreddit filter', () => {
    const filters: DashboardFilters = { selectedSubreddits: ['webdev'] };
    const result = transformPosts(basePosts, filters, { topPostLimit: 3 });
    expect(result.insights.topScoreDelta).toHaveLength(2);
    expect(result.insights.topScoreDelta[0].id).toBe('3');
    expect(result.insights.topScoreDelta[0].scoreDelta).toBe(120);
    expect(result.insights.subredditActivity).toEqual([
      { subreddit: 'webdev', count: 2 },
    ]);
  });

  it('applies timeframe filtering when computing subreddit activity', () => {
    const filters: DashboardFilters = {
      timeframe: { start: 1_700_000_000, end: 1_700_060_000 },
    };
    const result = transformPosts(basePosts, filters, { topPostLimit: 5 });
    const subs = result.insights.subredditActivity;
    expect(subs.find(entry => entry.subreddit === 'webdev')?.count).toBe(1);
    expect(subs.find(entry => entry.subreddit === 'technology')?.count).toBe(2);
  });

  it('limits keyword frequency to tracked keywords when provided', () => {
    const filters: DashboardFilters = {
      trackedKeywords: ['react', 'context'],
    };
    const result = transformPosts(basePosts, filters, { keywordLimit: 5 });
    expect(result.insights.keywordFrequency).toEqual([
      { keyword: 'react', count: 2 },
      { keyword: 'context', count: 1 },
    ]);
  });

  it('applies keyword query filtering to both posts and keyword counts', () => {
    const filters: DashboardFilters = {
      keywordQuery: 'react',
    };
    const result = computeInsights(basePosts, filters);
    expect(result.filteredPosts).toBe(2);
    const reactEntry = result.keywordFrequency.find(entry => entry.keyword === 'react');
    expect(reactEntry).toBeDefined();
    expect(reactEntry?.count).toBe(2);
  });
});
