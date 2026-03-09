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
const {
  normalizeSubredditList,
  buildCoverageScopeId,
  createCoverageBundle,
  getCoverageBundle,
  saveCoverageBundle,
  deleteCoverageBundle,
  getCoverageState,
  upsertCoverageState,
  recordCoveragePage,
  summarizeCoverageBundle,
} = require('../../repos/reddit-coverage');

const SUBREDDIT_REGEX = /^[A-Za-z0-9_]{2,21}$/;
const DEFAULT_MAX_SUBREDDITS = 50;

function parseSubreddits(value) {
  if (Array.isArray(value)) return normalizeSubredditList(value);
  if (typeof value === 'string') return normalizeSubredditList(value.split(','));
  return [];
}

function isTruthyFlag(value) {
  if (typeof value === 'boolean') return value;
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());
}

function validateSubredditCount(req, res, subs) {
  const maxSubreddits = readNumber('REDDIT_MAX_SUBREDDITS', DEFAULT_MAX_SUBREDDITS);
  if (subs.length > maxSubreddits) {
    withCORS(req, res).status(400).json({
      error: 'Too many subreddits',
      max_subreddits: maxSubreddits,
    });
    return false;
  }
  return true;
}

async function parseBody(req, res) {
  if (req.body && typeof req.body === 'object') return req.body;
  try {
    return await new Promise((resolve, reject) => {
      let data = '';
      req.on('data', chunk => { data += chunk; });
      req.on('end', () => {
        try {
          resolve(JSON.parse(data || '{}'));
        } catch (error) {
          reject(error);
        }
      });
      req.on('error', reject);
    });
  } catch (_error) {
    withCORS(req, res).status(400).json({ error: 'Invalid JSON body' });
    return null;
  }
}

async function resolveFetchContext(req, res) {
  const timeBudget = createTimeBudget(Date.now());
  const tokenTimeoutMs = readNumber('REDDIT_TOKEN_TIMEOUT_MS', DEFAULT_TOKEN_TIMEOUT_MS);
  const requestTimeoutMs = readNumber('REDDIT_ADVANCE_FETCH_TIMEOUT_MS', Math.min(DEFAULT_FETCH_TIMEOUT_MS, 4000));
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

function buildResultFromBundle(bundle, requestedSubs) {
  return requestedSubs.map((subreddit) => {
    const state = getCoverageState(bundle, subreddit);
    const subKey = String(subreddit || '').toLowerCase();
    return {
      subreddit,
      state: state || null,
      posts: Array.isArray(bundle?.postsBySubreddit?.[subKey]) ? bundle.postsBySubreddit[subKey] : [],
    };
  });
}

async function getHandler(req, res) {
  const { query } = parseRequest(req);
  const subs = parseSubreddits(getQueryValue(query, 'subs', ''));
  if (!subs.length) {
    return withCORS(req, res).status(400).json({ error: 'Missing subs param' });
  }
  if (!validateSubredditCount(req, res, subs)) return;

  const mode = String(getQueryValue(query, 'mode', 'new')).toLowerCase();
  const time = String(getQueryValue(query, 'time', 'day')).toLowerCase();
  const days = clampInt(getQueryValue(query, 'days', '1'), 1, 7, 1);
  const targetWindowDays = clampInt(getQueryValue(query, 'target_window_days', String(days)), 1, 5, days);
  const scopeId = buildCoverageScopeId({ subreddits: subs, mode, time, days, targetWindowDays });
  const bundle = await getCoverageBundle(scopeId);

  if (!bundle) {
    return withCORS(req, res).status(200).json({
      scopeId,
      summary: summarizeCoverageBundle(createCoverageBundle({
        scopeId,
        subreddits: subs,
        mode,
        time,
        days,
        targetWindowDays,
      })),
      results: [],
    });
  }

  return withCORS(req, res).status(200).json({
    scopeId,
    summary: summarizeCoverageBundle(bundle),
    results: buildResultFromBundle(bundle, subs),
  });
}

async function postAdvanceHandler(req, res) {
  const body = await parseBody(req, res);
  if (res.finished) return;

  const subs = parseSubreddits(body?.subs);
  const sub = String(body?.sub || '').trim().toLowerCase();
  if (!subs.length) {
    return withCORS(req, res).status(400).json({ error: 'Missing subs param' });
  }
  if (!validateSubredditCount(req, res, subs)) return;
  if (!sub) {
    return withCORS(req, res).status(400).json({ error: 'sub is required' });
  }
  if (!SUBREDDIT_REGEX.test(sub)) {
    return withCORS(req, res).status(400).json({ error: 'Invalid subreddit name' });
  }

  const mode = String(body?.mode || 'new').toLowerCase() === 'top' ? 'top' : 'new';
  const time = String(body?.time || 'day').toLowerCase();
  const days = clampInt(body?.days, 1, 7, 1);
  const targetWindowDays = clampInt(body?.targetWindowDays ?? body?.target_window_days ?? days, 1, 5, days);
  const limit = clampInt(body?.limit, 5, 25, 15);
  const includeMeta = isTruthyFlag(body?.include_meta) || subs.length < 12;
  const scopeId = buildCoverageScopeId({ subreddits: subs, mode, time, days, targetWindowDays });
  let bundle = await getCoverageBundle(scopeId);
  if (!bundle) {
    bundle = createCoverageBundle({
      scopeId,
      subreddits: subs,
      mode,
      time,
      days,
      targetWindowDays,
    });
  }

  let state = getCoverageState(bundle, sub);
  if (!state) {
    bundle = upsertCoverageState(bundle, sub, (current) => current);
    state = getCoverageState(bundle, sub);
  }

  if (state.cooldown_until && state.cooldown_until > Date.now()) {
    return withCORS(req, res).status(200).json({
      scopeId,
      advanced: false,
      cooldown_until: state.cooldown_until,
      summary: summarizeCoverageBundle(bundle),
    });
  }

  try {
    const context = await resolveFetchContext(req, res);
    const redditBaseUrl = context.authMode === 'oauth' ? 'https://oauth.reddit.com' : 'https://www.reddit.com';
    let meta = state.meta || null;
    if (includeMeta && !meta) {
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

    const cutoff = Math.floor(Date.now() / 1000) - days * 86400;
    const listingUrl = new URL(`${redditBaseUrl}/r/${encodeURIComponent(sub)}/${mode}.json`);
    listingUrl.searchParams.set('limit', String(limit));
    listingUrl.searchParams.set('raw_json', '1');
    if (state.next_after) listingUrl.searchParams.set('after', state.next_after);
    if (mode === 'top') listingUrl.searchParams.set('t', time);

    const json = await context.fetchJSON(listingUrl.toString());
    const normalizedPosts = normalize(json);
    const posts = mode === 'top'
      ? normalizedPosts
      : normalizedPosts.filter((post) => (post.created_utc || 0) >= cutoff);
    const nextAfter = json?.data?.after || '';
    const oldest = normalizedPosts[normalizedPosts.length - 1];
    const done = !nextAfter || (mode === 'new' && (!oldest || oldest.created_utc < cutoff));

    bundle = recordCoveragePage(bundle, sub, {
      posts,
      meta,
      nextAfter,
      done,
      targetWindowDays,
      now: Date.now(),
    });
    bundle = upsertCoverageState(bundle, sub, (current) => ({
      ...current,
      status: done ? 'complete' : 'active',
      cooldown_until: null,
      last_error: null,
    }));

    await saveCoverageBundle(bundle);
    return withCORS(req, res).status(200).json({
      scopeId,
      advanced: true,
      auth_mode: context.authMode,
      summary: summarizeCoverageBundle(bundle),
      result: buildResultFromBundle(bundle, [sub])[0],
    });
  } catch (error) {
    if (error?.code === 'RATE_LIMITED') {
      const retryAfterSeconds = Math.max(1, Number(error.retryAfterSeconds) || 15);
      bundle = upsertCoverageState(bundle, sub, (current) => ({
        ...current,
        status: 'cooldown',
        cooldown_until: Date.now() + retryAfterSeconds * 1000,
        last_error: 'RATE_LIMITED',
      }));
      await saveCoverageBundle(bundle);
      return withCORS(req, res).status(429).json({
        error: 'Rate limited',
        retryAfter: retryAfterSeconds,
        scopeId,
        summary: summarizeCoverageBundle(bundle),
      });
    }

    bundle = upsertCoverageState(bundle, sub, (current) => ({
      ...current,
      status: 'error',
      last_error: error.message,
    }));
    await saveCoverageBundle(bundle);
    return withCORS(req, res).status(500).json({
      error: 'Failed to advance subreddit coverage',
      message: error.message,
      scopeId,
      summary: summarizeCoverageBundle(bundle),
    });
  }
}

async function deleteHandler(req, res) {
  const { query } = parseRequest(req);
  const subs = parseSubreddits(getQueryValue(query, 'subs', ''));
  if (!subs.length) {
    return withCORS(req, res).status(400).json({ error: 'Missing subs param' });
  }
  if (!validateSubredditCount(req, res, subs)) return;

  const mode = String(getQueryValue(query, 'mode', 'new')).toLowerCase();
  const time = String(getQueryValue(query, 'time', 'day')).toLowerCase();
  const days = clampInt(getQueryValue(query, 'days', '1'), 1, 7, 1);
  const targetWindowDays = clampInt(getQueryValue(query, 'target_window_days', String(days)), 1, 5, days);
  const scopeId = buildCoverageScopeId({ subreddits: subs, mode, time, days, targetWindowDays });
  await deleteCoverageBundle(scopeId);

  return withCORS(req, res, 'GET, POST, DELETE, OPTIONS').status(200).json({
    success: true,
    scopeId,
  });
}

module.exports = async function redditCoverageHandler(req, res) {
  if (req.method === 'OPTIONS') {
    return withCORS(req, res, 'GET, POST, DELETE, OPTIONS').status(204).end();
  }

  const { url } = parseRequest(req);
  if (req.method === 'GET' && url.pathname === '/api/reddit/coverage') {
    return getHandler(req, res);
  }
  if (req.method === 'DELETE' && url.pathname === '/api/reddit/coverage') {
    return deleteHandler(req, res);
  }
  if (req.method === 'POST' && url.pathname === '/api/reddit/advance') {
    return postAdvanceHandler(req, res);
  }
  return withCORS(req, res, 'GET, POST, DELETE, OPTIONS').status(405).json({ error: 'Method not allowed' });
};
