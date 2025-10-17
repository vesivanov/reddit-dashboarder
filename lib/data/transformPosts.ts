export interface RawRedditPost {
  id: string;
  subreddit: string;
  title: string;
  score: number;
  created_utc: number;
  num_comments?: number;
  author?: string;
  domain?: string;
  selftext?: string | null;
  selftext_html?: string | null;
  thumbnail?: string | null;
  url?: string;
  score_delta?: number | null;
  scoreDelta?: number | null;
  previous_score?: number | null;
  previousScore?: number | null;
  [key: string]: unknown;
}

export interface NormalizedPost extends RawRedditPost {
  scoreDelta: number;
  created_utc: number;
  keywords: string[];
}

export interface DashboardTimeframe {
  start?: number;
  end?: number;
}

export interface DashboardFilters {
  selectedSubreddits?: string[];
  keywordQuery?: string;
  timeframe?: DashboardTimeframe | null;
  trackedKeywords?: string[];
}

export interface SubredditActivityInsight {
  subreddit: string;
  count: number;
}

export interface KeywordFrequencyInsight {
  keyword: string;
  count: number;
}

export interface DashboardInsights {
  topScoreDelta: NormalizedPost[];
  subredditActivity: SubredditActivityInsight[];
  keywordFrequency: KeywordFrequencyInsight[];
  totalPosts: number;
  filteredPosts: number;
}

export interface TransformOptions {
  topPostLimit?: number;
  keywordLimit?: number;
  stopWords?: string[];
}

export interface TransformResult {
  posts: NormalizedPost[];
  filteredPosts: NormalizedPost[];
  insights: DashboardInsights;
}

const DEFAULT_STOP_WORDS = new Set([
  'a','an','and','are','as','at','be','but','by','for','from','has','have','in','into','is','it','its','of','on','or','that','the','their','there','to','was','were','will','with','you','your','i','we','they','this','those','these','what','when','where','who','how','why'
]);

function normaliseSubredditName(name: string): string {
  return name.trim().replace(/^r\//i, '').toLowerCase();
}

function buildKeywordList(text: string | null | undefined): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .split(/[^a-z0-9']+/)
    .map(token => token.replace(/^'+|'+$/g, ''))
    .filter(token => token.length >= 3 && !DEFAULT_STOP_WORDS.has(token));
}

export function normalisePost(post: RawRedditPost): NormalizedPost {
  const baseScore = typeof post.score === 'number' ? post.score : 0;
  const previous = typeof post.previous_score === 'number'
    ? post.previous_score
    : typeof post.previousScore === 'number'
      ? post.previousScore
      : typeof post.score === 'number'
        ? post.score
        : 0;
  const explicitDelta =
    typeof post.score_delta === 'number'
      ? post.score_delta
      : typeof post.scoreDelta === 'number'
        ? post.scoreDelta
        : null;
  const scoreDelta = explicitDelta !== null ? explicitDelta : baseScore - previous;
  const createdUtc = typeof post.created_utc === 'number' ? post.created_utc : 0;
  const keywords = Array.from(
    new Set([
      ...buildKeywordList(post.title ?? ''),
      ...buildKeywordList(post.selftext ?? ''),
    ])
  );
  return {
    ...post,
    created_utc: createdUtc,
    scoreDelta,
    keywords,
  };
}

function applyFilters(posts: NormalizedPost[], filters: DashboardFilters = {}): NormalizedPost[] {
  const { selectedSubreddits, keywordQuery, timeframe } = filters;
  const selected = selectedSubreddits?.map(normaliseSubredditName);
  const keyword = keywordQuery?.trim().toLowerCase();
  const start = timeframe?.start;
  const end = timeframe?.end;

  return posts.filter(post => {
    if (selected && selected.length > 0) {
      const postSub = normaliseSubredditName(post.subreddit || '');
      if (!selected.includes(postSub)) {
        return false;
      }
    }

    if (typeof start === 'number' && post.created_utc < start) {
      return false;
    }
    if (typeof end === 'number' && post.created_utc > end) {
      return false;
    }

    if (keyword && keyword.length > 0) {
      const haystack = `${post.title ?? ''} ${(post.selftext ?? '')}`.toLowerCase();
      if (!haystack.includes(keyword)) {
        return false;
      }
    }

    return true;
  });
}

function sortDescending<T>(items: T[], selector: (value: T) => number): T[] {
  return [...items].sort((a, b) => selector(b) - selector(a));
}

function computeTopScoreDelta(posts: NormalizedPost[], limit: number): NormalizedPost[] {
  return sortDescending(posts, post => post.scoreDelta || 0)
    .slice(0, limit)
    .map(post => ({ ...post }));
}

function computeSubredditActivity(posts: NormalizedPost[], limit: number): SubredditActivityInsight[] {
  const counts = new Map<string, number>();
  for (const post of posts) {
    const sub = post.subreddit || 'unknown';
    counts.set(sub, (counts.get(sub) || 0) + 1);
  }
  return sortDescending(Array.from(counts.entries()), ([, count]) => count)
    .slice(0, limit)
    .map(([subreddit, count]) => ({ subreddit, count }));
}

function computeKeywordFrequency(
  posts: NormalizedPost[],
  limit: number,
  filters: DashboardFilters,
  stopWords: Set<string>
): KeywordFrequencyInsight[] {
  const tracked = filters.trackedKeywords?.map(word => word.toLowerCase()) ?? [];
  const keywordQuery = filters.keywordQuery?.toLowerCase().trim();
  const counts = new Map<string, number>();

  const trackAll = tracked.length === 0;

  const targetKeywords = new Set<string>(tracked);
  if (keywordQuery && keywordQuery.length > 0) {
    for (const token of keywordQuery.split(/\s+/)) {
      if (token) {
        targetKeywords.add(token.toLowerCase());
      }
    }
  }

  for (const post of posts) {
    const tokens = post.keywords.length > 0 ? post.keywords : buildKeywordList(post.title ?? '');
    for (const token of tokens) {
      if (!trackAll && !targetKeywords.has(token)) continue;
      if (stopWords.has(token)) continue;
      counts.set(token, (counts.get(token) || 0) + 1);
    }
  }

  if (!trackAll && counts.size === 0) {
    for (const keyword of targetKeywords) {
      counts.set(keyword, 0);
    }
  }

  return sortDescending(Array.from(counts.entries()), ([, count]) => count)
    .slice(0, limit)
    .map(([keyword, count]) => ({ keyword, count }));
}

export function transformPosts(
  rawPosts: RawRedditPost[],
  filters: DashboardFilters = {},
  options: TransformOptions = {}
): TransformResult {
  const topPostLimit = options.topPostLimit ?? 5;
  const keywordLimit = options.keywordLimit ?? 10;
  const stopWords = new Set(options.stopWords ?? Array.from(DEFAULT_STOP_WORDS));

  const posts = rawPosts.map(normalisePost);
  const filteredPosts = applyFilters(posts, filters);

  const topScoreDelta = computeTopScoreDelta(filteredPosts, topPostLimit);
  const subredditActivity = computeSubredditActivity(filteredPosts, topPostLimit);
  const keywordFrequency = computeKeywordFrequency(filteredPosts, keywordLimit, filters, stopWords);

  return {
    posts,
    filteredPosts,
    insights: {
      topScoreDelta,
      subredditActivity,
      keywordFrequency,
      totalPosts: posts.length,
      filteredPosts: filteredPosts.length,
    },
  };
}

export function computeInsights(
  rawPosts: RawRedditPost[],
  filters: DashboardFilters = {},
  options: TransformOptions = {}
): DashboardInsights {
  return transformPosts(rawPosts, filters, options).insights;
}
