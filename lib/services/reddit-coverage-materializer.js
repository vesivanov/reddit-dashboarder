const coverageHandler = require('../api-handlers/reddit/coverage');
const storage = require('../storage');
const { getExpiringValue, setExpiringValue } = require('../rate-limit-store');

const UPSTREAM_REDDIT_COOLDOWN_KEY = 'reddit:upstream-cooldown';

function clampInt(value, min, max, fallback) {
  const parsed = parseInt(value || '', 10);
  if (Number.isFinite(parsed)) {
    return Math.max(min, Math.min(max, parsed));
  }
  return fallback;
}

async function invokeHandler(handler, req) {
  const headers = {};
  let body;
  let statusCode = 200;

  const resMock = {
    setHeader(name, value) {
      headers[String(name).toLowerCase()] = value;
    },
    getHeader(name) {
      return headers[String(name).toLowerCase()];
    },
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      body = payload;
      return this;
    },
    end(payload) {
      body = payload;
      return this;
    },
  };

  await handler(req, resMock);
  return { statusCode, headers, body };
}

function buildPassthroughReq(req, {
  method = 'GET',
  url,
  body,
} = {}) {
  const passthroughReq = Object.create(req || null);
  passthroughReq.method = method;
  passthroughReq.headers = req?.headers || {};
  passthroughReq.connection = req?.connection;
  passthroughReq.socket = req?.socket;
  passthroughReq.url = url || req?.url || '/';
  passthroughReq.originalUrl = passthroughReq.url;
  if (body !== undefined) {
    passthroughReq.body = body;
  }
  return passthroughReq;
}

async function invokeCoverageHandler(req) {
  return invokeHandler(coverageHandler, req);
}

async function materializeCoverageFetch(req, params, {
  forceFresh = false,
  includeCoverageState = true,
  requestShape = null,
} = {}) {
  const subs = (params.get('subs') || '')
    .split(',')
    .map((sub) => sub.trim())
    .filter(Boolean);
  if (!subs.length) return null;

  const startedAt = Date.now();
  const mode = String(params.get('mode') || 'new').toLowerCase();
  const time = String(params.get('time') || 'day').toLowerCase();
  const days = clampInt(params.get('days'), 1, 7, 1);
  const targetWindowDays = clampInt(params.get('target_window_days') || String(days), 1, 5, Math.min(days, 5));
  const requestedLimit = clampInt(params.get('limit'), 25, 100, 100);
  const requestedFetchAllPages = ['0', 'all'].includes(String(params.get('max_pages') || '').toLowerCase());
  const requestedMaxPages = requestedFetchAllPages ? 0 : clampInt(params.get('max_pages'), 1, 30, 5);
  const effectiveLimit = requestShape?.limit || Math.min(25, requestedLimit);
  const effectiveMaxPages = requestShape
    ? (requestShape.fetchAllPages ? 0 : requestShape.maxPages)
    : requestedMaxPages;

  const coverageQuery = new URLSearchParams({
    subs: subs.join(','),
    mode,
    time,
    days: String(days),
    target_window_days: String(targetWindowDays),
  });

  if (forceFresh) {
    const deleteReq = buildPassthroughReq(req, {
      method: 'DELETE',
      url: `/api/reddit/coverage?${coverageQuery.toString()}`,
    });
    const deleteResult = await invokeCoverageHandler(deleteReq);
    if (deleteResult.statusCode >= 400) {
      return deleteResult;
    }
  }

  const coverageStateBySub = new Map();
  const coverageResultsBySub = new Map();
  const passthroughHeaders = new Map();
  let authMode = null;
  let advanceCount = 0;
  let metaEstimateCount = 0;
  let sharedCooldownHit = false;
  let globalRetryAfterSeconds = 0;
  const terminalSubsForPass = new Set();

  const appendHeaderValues = (name, value) => {
    if (value == null) return;
    const headerName = String(name || '').toLowerCase();
    if (!headerName) return;
    const nextValues = Array.isArray(value) ? value : [value];
    const existing = passthroughHeaders.get(headerName) || [];
    passthroughHeaders.set(headerName, existing.concat(nextValues));
  };

  const applyCoverage = (summary, results = []) => {
    if (summary && Array.isArray(summary.subreddits)) {
      summary.subreddits.forEach((entry) => {
        const subKey = String(entry?.subreddit || '').toLowerCase();
        if (subKey) coverageStateBySub.set(subKey, entry);
      });
    }
    if (Array.isArray(results)) {
      results.forEach((entry) => {
        const subKey = String(entry?.subreddit || '').toLowerCase();
        if (!subKey) return;
        coverageResultsBySub.set(subKey, entry);
        if (entry?.state) {
          coverageStateBySub.set(subKey, entry.state);
        }
      });
    }
  };

  const initialReq = buildPassthroughReq(req, {
    method: 'GET',
    url: `/api/reddit/coverage?${coverageQuery.toString()}`,
  });
  const initialCoverage = await invokeCoverageHandler(initialReq);
  if (initialCoverage.statusCode >= 400) {
    return initialCoverage;
  }
  appendHeaderValues('set-cookie', initialCoverage?.headers?.['set-cookie']);
  applyCoverage(initialCoverage?.body?.summary, initialCoverage?.body?.results);

  const sharedCooldown = await getExpiringValue(UPSTREAM_REDDIT_COOLDOWN_KEY);
  if (sharedCooldown?.value?.retryAfterSeconds && sharedCooldown.ttlMs > 0) {
    sharedCooldownHit = true;
    globalRetryAfterSeconds = Math.max(1, Math.ceil(sharedCooldown.ttlMs / 1000));
  }

  const cutoffUtc = Math.floor(Date.now() / 1000) - (targetWindowDays * 86400);
  const isCoverageComplete = (state) => {
    if (!state) return false;
    if (state.status === 'complete') return true;
    if (mode !== 'new') return false;
    const coveredThroughUtc = Number(state.covered_through_utc) || 0;
    return coveredThroughUtc > 0 && coveredThroughUtc <= cutoffUtc;
  };
  const isPageCapped = (state) => (
    effectiveMaxPages !== 0
    && Number(state?.page_count || 0) >= effectiveMaxPages
    && !isCoverageComplete(state)
  );

  let stopAfterCurrentPass = false;
  while (!stopAfterCurrentPass) {
    const pendingSubs = subs.filter((sub) => {
      if (globalRetryAfterSeconds > 0) return false;
      const subKey = String(sub || '').toLowerCase();
      if (terminalSubsForPass.has(subKey)) return false;
      const state = coverageStateBySub.get(subKey);
      if (isCoverageComplete(state) || isPageCapped(state)) return false;
      return !(Number(state?.cooldown_until || 0) > Date.now());
    });
    if (!pendingSubs.length) break;

    for (const sub of pendingSubs) {
      const subKey = String(sub || '').toLowerCase();
      const state = coverageStateBySub.get(subKey);
      const includeMeta = subs.length < 12 && Number(state?.page_count || 0) === 0;
      const advanceReq = buildPassthroughReq(req, {
        method: 'POST',
        url: '/api/reddit/advance',
        body: {
          subs,
          sub,
          mode,
          time,
          days,
          target_window_days: targetWindowDays,
          limit: effectiveLimit,
          include_meta: includeMeta,
        },
      });
      const advanceResult = await invokeCoverageHandler(advanceReq);
      if (advanceResult.statusCode >= 400) {
        return advanceResult;
      }
      appendHeaderValues('set-cookie', advanceResult?.headers?.['set-cookie']);
      advanceCount += 1;
      if (includeMeta) metaEstimateCount += 1;
      authMode = authMode || advanceResult?.body?.auth_mode || null;
      applyCoverage(advanceResult?.body?.summary, advanceResult?.body?.result ? [advanceResult.body.result] : []);
      if (advanceResult?.body?.advanced === false && (advanceResult?.body?.result?.error || advanceResult?.body?.result?.timed_out)) {
        terminalSubsForPass.add(subKey);
      }

      if (advanceResult?.body?.rate_limited || (advanceResult?.body?.advanced === false && advanceResult?.body?.cooldown_until)) {
        const retryAfterSeconds = Math.max(
          1,
          Number(advanceResult?.body?.retryAfter) || 0,
          Number(advanceResult?.body?.retry_after_seconds) || 0,
          (Number(advanceResult?.body?.cooldown_until) > Date.now()
            ? Math.ceil((Number(advanceResult.body.cooldown_until) - Date.now()) / 1000)
            : 0)
        );
        globalRetryAfterSeconds = retryAfterSeconds;
        await setExpiringValue(UPSTREAM_REDDIT_COOLDOWN_KEY, {
          source: 'reddit',
          retryAfterSeconds,
          setAt: Date.now(),
        }, retryAfterSeconds * 1000);
        stopAfterCurrentPass = true;
        break;
      }
    }
  }

  const results = subs.map((subreddit) => {
    const subKey = String(subreddit || '').toLowerCase();
    const state = coverageStateBySub.get(subKey) || null;
    const result = coverageResultsBySub.get(subKey) || null;
    const stateRateLimited = state?.last_error === 'RATE_LIMITED' || state?.status === 'cooldown';
    const isTimedOut = Boolean(result?.timed_out) || state?.status === 'timeout';
    const shouldMarkRateLimited = (
      stateRateLimited
      || (
        globalRetryAfterSeconds > 0
        && !isCoverageComplete(state)
        && !isPageCapped(state)
        && !Array.isArray(result?.posts)
      )
    );
    const retryAfterForEntry = globalRetryAfterSeconds > 0
      ? globalRetryAfterSeconds
      : (Number(state?.cooldown_until) > Date.now()
        ? Math.ceil((Number(state.cooldown_until) - Date.now()) / 1000)
        : 0);
    return {
      subreddit,
      meta: result?.state?.meta || result?.meta || state?.meta || null,
      posts: Array.isArray(result?.posts) ? result.posts : [],
      partial: isPageCapped(state),
      timed_out: isTimedOut,
      ...(includeCoverageState ? { coverage_state: state } : {}),
      error: shouldMarkRateLimited
        ? '[RATE_LIMIT] Reddit cooldown active for this request.'
        : (result?.error || state?.last_error || null),
      ...(shouldMarkRateLimited ? {
        error_code: 'RATE_LIMITED',
        retry_after_seconds: retryAfterForEntry || undefined,
      } : {}),
    };
  });

  const activeCooldownSubs = results.filter((entry) => (
    Number(entry?.coverage_state?.cooldown_until || 0) > Date.now()
    || entry?.error_code === 'RATE_LIMITED'
  ));
  const retryAfterSeconds = globalRetryAfterSeconds > 0
    ? globalRetryAfterSeconds
    : activeCooldownSubs.length
    ? Math.max(0, ...activeCooldownSubs.map((entry) => {
      if (Number(entry?.retry_after_seconds) > 0) return Number(entry.retry_after_seconds);
      const cooldownUntil = Number(entry?.coverage_state?.cooldown_until || 0);
      return cooldownUntil > Date.now() ? Math.ceil((cooldownUntil - Date.now()) / 1000) : 0;
    }))
    : 0;

  return {
    statusCode: 200,
    headers: Object.fromEntries(Array.from(passthroughHeaders.entries()).map(([name, values]) => ([
      name,
      name === 'set-cookie' ? values : values[values.length - 1],
    ]))),
    body: {
      mode,
      time,
      days,
      limit: effectiveLimit,
      max_pages: effectiveMaxPages,
      fetch_all_pages: effectiveMaxPages === 0,
      auth_mode: authMode,
      storage: {
        persistent: Boolean(storage?.persistent),
        kind: storage?.kind || 'memory',
      },
      results,
      fetched_at: Date.now(),
      request_capped: Boolean(requestShape?.wasCapped),
      rate_limited: activeCooldownSubs.length > 0,
      rate_limited_subreddits: activeCooldownSubs.map((entry) => entry.subreddit),
      ...(retryAfterSeconds > 0 ? { retry_after_seconds: retryAfterSeconds } : {}),
      timed_out: results.some((entry) => entry.timed_out),
      timed_out_subreddits: results.filter((entry) => entry.timed_out).map((entry) => entry.subreddit),
      coverage_summary: {
        complete1dCount: results.filter((entry) => Boolean(entry?.coverage_state?.complete_1d)).length,
        complete3dCount: results.filter((entry) => Boolean(entry?.coverage_state?.complete_3d)).length,
        complete5dCount: results.filter((entry) => Boolean(entry?.coverage_state?.complete_5d)).length,
      },
      metrics: {
        subredditCount: results.length,
        totalPosts: results.reduce((sum, entry) => sum + (entry.posts?.length || 0), 0),
        rateLimitedCount: activeCooldownSubs.length,
        durationMs: Date.now() - startedAt,
        timedOutCount: results.filter((entry) => entry.timed_out).length,
        retryAfterSeconds,
        redditRequestCount: advanceCount + metaEstimateCount,
        sharedCooldownHit,
        requestCapped: Boolean(requestShape?.wasCapped),
      },
    },
  };
}

module.exports = {
  clampInt,
  buildPassthroughReq,
  invokeHandler,
  materializeCoverageFetch,
};
