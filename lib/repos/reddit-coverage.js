const crypto = require('crypto');
const storage = require('../storage');

const REDDIT_COVERAGE_PREFIX = 'reddit-coverage:';
const DEFAULT_COVERAGE_TTL_SECONDS = 7 * 24 * 60 * 60;

function normalizeSubredditList(subreddits = []) {
  return Array.from(new Set(
    (Array.isArray(subreddits) ? subreddits : [])
      .map((sub) => String(sub || '').trim().toLowerCase())
      .filter(Boolean)
  )).sort();
}

function buildCoverageScopeId({
  subreddits = [],
  mode = 'new',
  time = 'day',
  days = 1,
  targetWindowDays = 1,
} = {}) {
  const normalized = {
    subreddits: normalizeSubredditList(subreddits),
    mode: String(mode || 'new').toLowerCase(),
    time: String(time || 'day').toLowerCase(),
    days: Number(days) || 1,
    targetWindowDays: Number(targetWindowDays) || Number(days) || 1,
  };
  const hash = crypto.createHash('sha1').update(JSON.stringify(normalized)).digest('hex').slice(0, 16);
  return `rcov_${hash}`;
}

function buildCoverageKey(scopeId) {
  return `${REDDIT_COVERAGE_PREFIX}${scopeId}`;
}

function createCoverageBundle({
  scopeId,
  subreddits = [],
  mode = 'new',
  time = 'day',
  days = 1,
  targetWindowDays = 1,
  now = Date.now(),
} = {}) {
  const normalizedSubs = normalizeSubredditList(subreddits);
  return {
    scopeId,
    mode: String(mode || 'new').toLowerCase(),
    time: String(time || 'day').toLowerCase(),
    days: Number(days) || 1,
    targetWindowDays: Number(targetWindowDays) || Number(days) || 1,
    createdAt: now,
    updatedAt: now,
    subreddits: normalizedSubs.map((subreddit) => ({
      subreddit,
      status: 'idle',
      next_after: '',
      cooldown_until: null,
      covered_through_utc: null,
      page_count: 0,
      post_count: 0,
      last_fetch_at: null,
      last_error: null,
      complete_1d: false,
      complete_3d: false,
      complete_5d: false,
      meta: null,
    })),
    postsBySubreddit: {},
  };
}

async function getCoverageBundle(scopeId) {
  if (!scopeId) return null;
  return storage.get(buildCoverageKey(scopeId));
}

async function saveCoverageBundle(bundle, ttlSeconds = DEFAULT_COVERAGE_TTL_SECONDS) {
  if (!bundle?.scopeId) return null;
  const next = {
    ...bundle,
    updatedAt: Date.now(),
  };
  await storage.set(buildCoverageKey(bundle.scopeId), next, ttlSeconds);
  return next;
}

async function deleteCoverageBundle(scopeId) {
  if (!scopeId) return;
  await storage.delete(buildCoverageKey(scopeId));
}

function getCoverageState(bundle, subreddit) {
  const subKey = String(subreddit || '').trim().toLowerCase();
  if (!bundle || !subKey) return null;
  return (bundle.subreddits || []).find((entry) => entry.subreddit === subKey) || null;
}

function upsertCoverageState(bundle, subreddit, updater) {
  const subKey = String(subreddit || '').trim().toLowerCase();
  if (!bundle || !subKey) return bundle;
  const nextSubreddits = [...(bundle.subreddits || [])];
  const index = nextSubreddits.findIndex((entry) => entry.subreddit === subKey);
  const current = index >= 0
    ? nextSubreddits[index]
    : {
        subreddit: subKey,
        status: 'idle',
        next_after: '',
        cooldown_until: null,
        covered_through_utc: null,
        page_count: 0,
        post_count: 0,
        last_fetch_at: null,
        last_error: null,
        complete_1d: false,
        complete_3d: false,
        complete_5d: false,
        meta: null,
      };
  const nextState = updater ? updater({ ...current }) : current;
  if (index >= 0) nextSubreddits[index] = nextState;
  else nextSubreddits.push(nextState);
  return {
    ...bundle,
    subreddits: nextSubreddits.sort((a, b) => a.subreddit.localeCompare(b.subreddit)),
  };
}

function mergePosts(existingPosts = [], incomingPosts = []) {
  const byId = new Map();
  for (const post of existingPosts) {
    if (post?.id) byId.set(String(post.id), post);
  }
  for (const post of incomingPosts) {
    if (post?.id) byId.set(String(post.id), post);
  }
  return Array.from(byId.values()).sort((a, b) => (Number(b.created_utc) || 0) - (Number(a.created_utc) || 0));
}

function recordCoveragePage(bundle, subreddit, {
  posts = [],
  meta = null,
  nextAfter = '',
  done = false,
  targetWindowDays = 1,
  now = Date.now(),
} = {}) {
  const subKey = String(subreddit || '').trim().toLowerCase();
  const existingPosts = Array.isArray(bundle?.postsBySubreddit?.[subKey]) ? bundle.postsBySubreddit[subKey] : [];
  const mergedPosts = mergePosts(existingPosts, posts);
  const oldestCoveredUtc = mergedPosts.length ? Number(mergedPosts[mergedPosts.length - 1].created_utc) || null : null;
  const cutoff1d = Math.floor(now / 1000) - 86400;
  const cutoff3d = Math.floor(now / 1000) - (3 * 86400);
  const cutoff5d = Math.floor(now / 1000) - (5 * 86400);

  const nextBundle = upsertCoverageState({
    ...bundle,
    postsBySubreddit: {
      ...(bundle?.postsBySubreddit || {}),
      [subKey]: mergedPosts,
    },
  }, subKey, (state) => ({
    ...state,
    status: done ? 'complete' : 'active',
    next_after: nextAfter || '',
    covered_through_utc: oldestCoveredUtc,
    page_count: Number(state.page_count || 0) + 1,
    post_count: mergedPosts.length,
    last_fetch_at: now,
    last_error: null,
    meta: meta || state.meta || null,
    complete_1d: oldestCoveredUtc !== null ? oldestCoveredUtc <= cutoff1d : false,
    complete_3d: oldestCoveredUtc !== null ? oldestCoveredUtc <= cutoff3d : false,
    complete_5d: oldestCoveredUtc !== null ? oldestCoveredUtc <= cutoff5d : false,
  }));

  return nextBundle;
}

function summarizeCoverageBundle(bundle) {
  const subreddits = Array.isArray(bundle?.subreddits) ? bundle.subreddits : [];
  return {
    scopeId: bundle?.scopeId || null,
    mode: bundle?.mode || 'new',
    time: bundle?.time || 'day',
    days: bundle?.days || 1,
    targetWindowDays: bundle?.targetWindowDays || bundle?.days || 1,
    updatedAt: bundle?.updatedAt || null,
    totalSubreddits: subreddits.length,
    complete1dCount: subreddits.filter((entry) => entry.complete_1d).length,
    complete3dCount: subreddits.filter((entry) => entry.complete_3d).length,
    complete5dCount: subreddits.filter((entry) => entry.complete_5d).length,
    totalPosts: subreddits.reduce((sum, entry) => sum + (Number(entry.post_count) || 0), 0),
    subreddits: subreddits.map((entry) => ({
      subreddit: entry.subreddit,
      status: entry.status,
      next_after: entry.next_after || '',
      cooldown_until: entry.cooldown_until || null,
      covered_through_utc: entry.covered_through_utc || null,
      page_count: Number(entry.page_count) || 0,
      post_count: Number(entry.post_count) || 0,
      last_fetch_at: entry.last_fetch_at || null,
      last_error: entry.last_error || null,
      complete_1d: Boolean(entry.complete_1d),
      complete_3d: Boolean(entry.complete_3d),
      complete_5d: Boolean(entry.complete_5d),
      meta: entry.meta || null,
    })),
  };
}

module.exports = {
  REDDIT_COVERAGE_PREFIX,
  DEFAULT_COVERAGE_TTL_SECONDS,
  normalizeSubredditList,
  buildCoverageScopeId,
  buildCoverageKey,
  createCoverageBundle,
  getCoverageBundle,
  saveCoverageBundle,
  deleteCoverageBundle,
  getCoverageState,
  upsertCoverageState,
  mergePosts,
  recordCoveragePage,
  summarizeCoverageBundle,
};
