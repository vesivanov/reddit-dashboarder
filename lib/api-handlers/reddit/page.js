const { withCORS } = require('../../cors');
const { parseRequest, getQueryValue } = require('../../request-utils');
const { createTokenManager, DEFAULT_TOKEN_TIMEOUT_MS } = require('../../services/reddit-auth');
const {
  DEFAULT_FETCH_TIMEOUT_MS,
  createTimeBudget,
  readNumber,
  getCachedSubredditMeta,
  setCachedSubredditMeta,
  createFetchJSON,
  createPublicFetchJSON,
  normalize,
  clampInt,
} = require('../../services/reddit-fetch');

const SUBREDDIT_REGEX = /^[A-Za-z0-9_]{2,21}$/;

async function resolveFetchContext(req, res) {
  const timeBudget = createTimeBudget(Date.now());
  const tokenTimeoutMs = readNumber('REDDIT_TOKEN_TIMEOUT_MS', DEFAULT_TOKEN_TIMEOUT_MS);
  const requestTimeoutMs = readNumber('REDDIT_PAGE_FETCH_TIMEOUT_MS', Math.min(DEFAULT_FETCH_TIMEOUT_MS, 4000));
  const tokenManager = createTokenManager(req, res, { timeBudget, tokenTimeoutMs });

  try {
    const token = await tokenManager.ensureToken();
    if (token) {
      return {
        authMode: 'oauth',
        fetchJSON: createFetchJSON(tokenManager, { requestTimeoutMs, defaultTries: 1 }),
      };
    }
  } catch (error) {
    const missingOAuthConfig = error?.message?.includes('Missing Reddit OAuth client credentials');
    const authFailure = error?.code === 'NOT_AUTHENTICATED' || error?.status === 401;
    if (!missingOAuthConfig && !authFailure) throw error;
  }

  return {
    authMode: 'public',
    fetchJSON: createPublicFetchJSON({ requestTimeoutMs, defaultTries: 1 }),
  };
}

module.exports = async function redditPageHandler(req, res) {
  if (req.method === 'OPTIONS') {
    return withCORS(req, res, 'GET, OPTIONS').status(204).end();
  }
  if (req.method !== 'GET') {
    return withCORS(req, res, 'GET, OPTIONS').status(405).json({ error: 'Method not allowed' });
  }

  const { query } = parseRequest(req);
  const sub = String(getQueryValue(query, 'sub', '')).trim();
  if (!sub) {
    return withCORS(req, res).status(400).json({ error: 'Missing sub param' });
  }
  if (!SUBREDDIT_REGEX.test(sub)) {
    return withCORS(req, res).status(400).json({ error: 'Invalid subreddit name' });
  }

  const mode = String(getQueryValue(query, 'mode', 'new')).toLowerCase() === 'top' ? 'top' : 'new';
  const time = String(getQueryValue(query, 'time', 'day'));
  const days = clampInt(getQueryValue(query, 'days', '1'), 1, 7, 1);
  const limit = clampInt(getQueryValue(query, 'limit', '25'), 25, 100, 25);
  const after = String(getQueryValue(query, 'after', ''));
  const includeMeta = ['1', 'true', 'yes'].includes(String(getQueryValue(query, 'include_meta', '')).toLowerCase());
  const cutoff = Math.floor(Date.now() / 1000) - days * 86400;

  try {
    const context = await resolveFetchContext(req, res);
    const redditBaseUrl = context.authMode === 'oauth' ? 'https://oauth.reddit.com' : 'https://www.reddit.com';
    let meta = null;

    if (includeMeta) {
      meta = getCachedSubredditMeta(sub);
      if (!meta) {
        const about = await context.fetchJSON(`${redditBaseUrl}/r/${encodeURIComponent(sub)}/about.json`);
        meta = {
          subscribers: about?.data?.subscribers ?? null,
          active_user_count: about?.data?.active_user_count ?? null,
          title: about?.data?.title || `r/${sub}`,
          icon_img: about?.data?.icon_img || null,
          description: about?.data?.public_description || '',
        };
        setCachedSubredditMeta(sub, meta);
      }
    }

    const listingUrl = new URL(`${redditBaseUrl}/r/${encodeURIComponent(sub)}/${mode}.json`);
    listingUrl.searchParams.set('limit', String(limit));
    listingUrl.searchParams.set('raw_json', '1');
    if (after) listingUrl.searchParams.set('after', after);
    if (mode === 'top') listingUrl.searchParams.set('t', time);

    const json = await context.fetchJSON(listingUrl.toString());
    const normalizedPosts = normalize(json);
    const posts = mode === 'top'
      ? normalizedPosts
      : normalizedPosts.filter((post) => (post.created_utc || 0) >= cutoff);
    const nextAfter = json?.data?.after || '';
    const oldest = normalizedPosts[normalizedPosts.length - 1];
    const done = !nextAfter || (mode === 'new' && (!oldest || oldest.created_utc < cutoff));

    return withCORS(req, res).status(200).json({
      subreddit: sub,
      meta,
      posts,
      after: nextAfter || null,
      done,
      auth_mode: context.authMode,
    });
  } catch (error) {
    if (error?.code === 'RATE_LIMITED') {
      const retryAfterSeconds = Math.max(1, Number(error.retryAfterSeconds) || 15);
      return withCORS(req, res).status(429).json({
        error: 'Rate limited',
        retryAfter: retryAfterSeconds,
      });
    }
    if (error?.code === 'NOT_AUTHENTICATED' || error?.status === 401) {
      return withCORS(req, res).status(401).json({ error: 'Not authenticated' });
    }
    return withCORS(req, res).status(500).json({
      error: 'Failed to fetch subreddit page',
      message: error.message,
    });
  }
};
