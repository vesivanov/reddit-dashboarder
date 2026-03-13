const { withCORS } = require('../../cors');
const storage = require('../../storage');
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
  DEFAULT_COVERAGE_FRESHNESS_MS,
  normalizeSubredditList,
  buildCoverageScopeId,
  createCoverageBundle,
  getCoverageBundle,
  updateCoverageBundle,
  deleteCoverageBundle,
  getCoverageState,
  upsertCoverageState,
  recordCoveragePage,
  resetStaleCoverage,
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

function getStorageInfo() {
  return {
    persistent: Boolean(storage?.persistent),
    kind: storage?.kind || 'memory',
  };
}

function buildEmptyCoverageBundle({ scopeId, subs, mode, time, days, targetWindowDays }) {
  return createCoverageBundle({
    scopeId,
    subreddits: subs,
    mode,
    time,
    days,
    targetWindowDays,
  });
}

function getCoverageFreshnessMs() {
  return Math.max(60 * 1000, readNumber('REDDIT_COVERAGE_FRESHNESS_MS', DEFAULT_COVERAGE_FRESHNESS_MS));
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
  let bundle = await getCoverageBundle(scopeId);

  if (!bundle) {
    return withCORS(req, res).status(200).json({
      scopeId,
      storage: getStorageInfo(),
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

  const now = Date.now();
  const freshnessMs = getCoverageFreshnessMs();
  const nextBundle = resetStaleCoverage(bundle, {
    now,
    freshnessMs,
    subreddits: subs,
  });
  if (nextBundle !== bundle) {
    bundle = await updateCoverageBundle(scopeId, (currentBundle) => resetStaleCoverage(currentBundle || bundle, {
      now,
      freshnessMs,
      subreddits: subs,
    }));
  }

  return withCORS(req, res).status(200).json({
    scopeId,
    storage: getStorageInfo(),
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
  const createBundle = () => buildEmptyCoverageBundle({ scopeId, subs, mode, time, days, targetWindowDays });
  let bundle = await getCoverageBundle(scopeId);
  if (!bundle) {
    bundle = createBundle();
  }
  const now = Date.now();
  const freshnessMs = getCoverageFreshnessMs();
  bundle = resetStaleCoverage(bundle, {
    now,
    freshnessMs,
    subreddits: [sub],
  });

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
      storage: getStorageInfo(),
      summary: summarizeCoverageBundle(bundle),
    });
  }
  const inflightLeaseMs = Math.max(5000, readNumber('REDDIT_ADVANCE_INFLIGHT_MS', 20000));
  let claim = { granted: false, reason: null, token: null };
  bundle = await updateCoverageBundle(scopeId, (currentBundle) => {
    let next = resetStaleCoverage(currentBundle || createBundle(), {
      now,
      freshnessMs,
      subreddits: [sub],
    });
    let currentState = getCoverageState(next, sub);
    if (!currentState) {
      next = upsertCoverageState(next, sub, (entry) => entry);
      currentState = getCoverageState(next, sub);
    }

    const activeCooldown = Number(currentState?.cooldown_until || 0) > now;
    const activeInflight = Number(currentState?.inflight_until || 0) > now;
    if (activeCooldown) {
      claim = { granted: false, reason: 'cooldown', token: null };
      return next;
    }
    if (activeInflight) {
      claim = { granted: false, reason: 'inflight', token: null };
      return next;
    }

    const token = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    claim = { granted: true, reason: null, token };
    return upsertCoverageState(next, sub, (current) => ({
      ...current,
      status: current.next_after ? 'active' : 'idle',
      cooldown_until: null,
      last_error: null,
      inflight_until: now + inflightLeaseMs,
      inflight_token: token,
    }));
  }, {
    createBundle,
  });
  state = getCoverageState(bundle, sub);

  if (claim.reason === 'cooldown' && state?.cooldown_until && state.cooldown_until > Date.now()) {
    return withCORS(req, res).status(200).json({
      scopeId,
      advanced: false,
      cooldown_until: state.cooldown_until,
      storage: getStorageInfo(),
      summary: summarizeCoverageBundle(bundle),
      result: buildResultFromBundle(bundle, [sub])[0],
    });
  }
  if (claim.reason === 'inflight') {
    return withCORS(req, res).status(200).json({
      scopeId,
      advanced: false,
      in_flight: true,
      storage: getStorageInfo(),
      summary: summarizeCoverageBundle(bundle),
      result: buildResultFromBundle(bundle, [sub])[0],
    });
  }

  const fallbackMeta = state.meta || {
    subscribers: null,
    active_user_count: null,
    title: `r/${sub}`,
    icon_img: null,
    description: '',
  };

  try {
    const context = await resolveFetchContext(req, res);
    const redditBaseUrl = context.authMode === 'oauth' ? 'https://oauth.reddit.com' : 'https://www.reddit.com';
    let meta = fallbackMeta;
    if (includeMeta && state.meta == null) {
      const cachedMeta = getCachedSubredditMeta(sub);
      if (cachedMeta) {
        meta = cachedMeta;
      } else {
        try {
          const about = await context.fetchJSON(`${redditBaseUrl}/r/${encodeURIComponent(sub)}/about.json`);
          if (about?.data) {
            meta = {
              subscribers: about?.data?.subscribers ?? null,
              active_user_count: about?.data?.active_user_count ?? null,
              title: about?.data?.title || `r/${sub}`,
              icon_img: about?.data?.icon_img || null,
              description: about?.data?.public_description || '',
            };
            setCachedSubredditMeta(sub, meta);
          }
        } catch (metaError) {
          if (metaError?.code === 'RATE_LIMITED' || metaError?.code === 'TIME_BUDGET_EXCEEDED') {
            throw metaError;
          }
          meta = fallbackMeta;
        }
      }
    } else if (includeMeta && state.meta) {
      try {
        if (!getCachedSubredditMeta(sub)) {
          setCachedSubredditMeta(sub, state.meta);
        }
      } catch (_metaCacheError) {
        meta = fallbackMeta;
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
    const listingExhausted = !nextAfter;
    const done = !nextAfter || (mode === 'new' && (!oldest || oldest.created_utc < cutoff));

    bundle = await updateCoverageBundle(scopeId, (currentBundle) => {
      let next = currentBundle || createBundle();
      const currentState = getCoverageState(next, sub);
      if (currentState?.inflight_token && currentState.inflight_token !== claim.token) {
        return next;
      }
      next = recordCoveragePage(next, sub, {
        posts,
        meta,
        nextAfter,
        done,
        targetWindowDays,
        observedOldestUtc: oldest?.created_utc ?? null,
        listingExhausted,
        now: Date.now(),
      });
      return upsertCoverageState(next, sub, (current) => ({
        ...current,
        status: done ? 'complete' : 'active',
        cooldown_until: null,
        last_error: null,
        inflight_until: null,
        inflight_token: null,
      }));
    }, {
      createBundle,
    });
    return withCORS(req, res).status(200).json({
      scopeId,
      advanced: true,
      auth_mode: context.authMode,
      storage: getStorageInfo(),
      summary: summarizeCoverageBundle(bundle),
      result: buildResultFromBundle(bundle, [sub])[0],
    });
  } catch (error) {
    if (error?.code === 'RATE_LIMITED') {
      const retryAfterSeconds = Math.max(1, Number(error.retryAfterSeconds) || 15);
      bundle = await updateCoverageBundle(scopeId, (currentBundle) => {
        let next = currentBundle || createBundle();
        const currentState = getCoverageState(next, sub);
        if (currentState?.inflight_token && currentState.inflight_token !== claim.token) {
          return next;
        }
        return upsertCoverageState(next, sub, (current) => ({
          ...current,
          status: 'cooldown',
          cooldown_until: Date.now() + retryAfterSeconds * 1000,
          last_error: 'RATE_LIMITED',
          inflight_until: null,
          inflight_token: null,
        }));
      }, {
        createBundle,
      });
      return withCORS(req, res).status(200).json({
        advanced: false,
        rate_limited: true,
        retryAfter: retryAfterSeconds,
        auth_mode: null,
        scopeId,
        storage: getStorageInfo(),
        summary: summarizeCoverageBundle(bundle),
        result: buildResultFromBundle(bundle, [sub])[0],
      });
    }

    const timedOut = error?.code === 'TIME_BUDGET_EXCEEDED' || /timeout/i.test(String(error?.message || ''));
    bundle = await updateCoverageBundle(scopeId, (currentBundle) => {
      let next = currentBundle || createBundle();
      const currentState = getCoverageState(next, sub);
      if (currentState?.inflight_token && currentState.inflight_token !== claim.token) {
        return next;
      }
      return upsertCoverageState(next, sub, (current) => ({
        ...current,
        status: timedOut ? 'timeout' : 'error',
        last_error: error.message,
        cooldown_until: null,
        inflight_until: null,
        inflight_token: null,
      }));
    }, {
      createBundle,
    });
    return withCORS(req, res).status(200).json({
      advanced: false,
      auth_mode: null,
      scopeId,
      storage: getStorageInfo(),
      summary: summarizeCoverageBundle(bundle),
      result: {
        ...buildResultFromBundle(bundle, [sub])[0],
        error: error.message,
        timed_out: timedOut,
      },
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
    storage: getStorageInfo(),
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
