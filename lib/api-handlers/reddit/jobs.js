const crypto = require('crypto');

const storage = require('../../storage');
const { withCORS } = require('../../cors');
const { parseRequest, getQueryValue } = require('../../request-utils');
const { createTokenManager, DEFAULT_TOKEN_TIMEOUT_MS } = require('../../services/reddit-auth');
const {
  DEFAULT_FETCH_TIMEOUT_MS,
  DEFAULT_FETCH_RETRIES,
  createTimeBudget,
  readNumber,
  getCachedSubredditMeta,
  setCachedSubredditMeta,
  createFetchJSON,
  createPublicFetchJSON,
  normalize,
  clampInt,
} = require('../../services/reddit-fetch');
const { getExpiringValue, setExpiringValue } = require('../../rate-limit-store');

const JOB_KEY_PREFIX = 'reddit-fetch-job:';
const JOB_TTL_SECONDS = 6 * 60 * 60;
const UPSTREAM_REDDIT_COOLDOWN_KEY = 'reddit:upstream-cooldown';
const SUBREDDIT_REGEX = /^[A-Za-z0-9_]{2,21}$/;

function buildJobKey(jobId) {
  return `${JOB_KEY_PREFIX}${jobId}`;
}

function generateJobId() {
  return `rjob_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`;
}

function parseBody(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => {
      try {
        resolve(JSON.parse(data || '{}'));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function toArraySubs(rawSubs) {
  if (Array.isArray(rawSubs)) return rawSubs;
  if (typeof rawSubs === 'string') return rawSubs.split(',');
  return [];
}

function parseRequestShape({ subsCount, limitParam, maxPagesParam }) {
  const requestedLimit = clampInt(limitParam, 25, 100, 100);
  const requestedFetchAllPages = ['0', 'all'].includes(String(maxPagesParam || '').toLowerCase());
  const requestedMaxPages = requestedFetchAllPages ? 0 : clampInt(maxPagesParam, 1, 30, 5);
  return {
    subsCount,
    limit: requestedLimit,
    maxPages: requestedMaxPages,
    fetchAllPages: requestedFetchAllPages,
  };
}

function buildInitialJob({ subs, mode, time, days, limit, maxPages, fetchAllPages }) {
  const now = Date.now();
  return {
    id: generateJobId(),
    status: 'queued',
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    completedAt: null,
    mode,
    time,
    days,
    limit,
    max_pages: maxPages,
    fetch_all_pages: fetchAllPages,
    auth_mode: null,
    retry_after_seconds: 0,
    cooldown_until: null,
    rate_limited_subreddits: [],
    timed_out_subreddits: [],
    error: null,
    subreddits: subs.map((subreddit) => ({
      subreddit,
      meta: null,
      posts: [],
      after: '',
      pageCount: 0,
      done: false,
      partial: false,
      error: null,
      error_code: null,
    })),
  };
}

function summarizeJob(job) {
  const results = (job.subreddits || []).map((entry) => ({
    subreddit: entry.subreddit,
    meta: entry.meta || null,
    posts: Array.isArray(entry.posts) ? entry.posts : [],
    partial: Boolean(entry.partial),
    error: entry.error || null,
    error_code: entry.error_code || null,
  }));
  const completedSubreddits = (job.subreddits || []).filter((entry) => entry.done).length;
  const totalPosts = results.reduce((sum, result) => sum + (result.posts?.length || 0), 0);
  return {
    id: job.id,
    status: job.status,
    created_at: new Date(job.createdAt).toISOString(),
    updated_at: new Date(job.updatedAt).toISOString(),
    started_at: job.startedAt ? new Date(job.startedAt).toISOString() : null,
    completed_at: job.completedAt ? new Date(job.completedAt).toISOString() : null,
    mode: job.mode,
    time: job.time,
    days: job.days,
    limit: job.limit,
    max_pages: job.max_pages,
    fetch_all_pages: job.fetch_all_pages,
    auth_mode: job.auth_mode || null,
    retry_after_seconds: Number(job.retry_after_seconds) || 0,
    cooldown_until: job.cooldown_until ? new Date(job.cooldown_until).toISOString() : null,
    rate_limited_subreddits: Array.from(new Set(job.rate_limited_subreddits || [])),
    timed_out_subreddits: Array.from(new Set(job.timed_out_subreddits || [])),
    progress: {
      completedSubreddits,
      totalSubreddits: (job.subreddits || []).length,
      processedPages: (job.subreddits || []).reduce((sum, entry) => sum + (Number(entry.pageCount) || 0), 0),
      totalPosts,
      currentSubreddit: (job.subreddits || []).find((entry) => !entry.done)?.subreddit || null,
      pendingSubreddits: (job.subreddits || []).filter((entry) => !entry.done).length,
    },
    results,
    metrics: {
      subredditCount: results.length,
      totalPosts,
      rateLimitedCount: Array.from(new Set(job.rate_limited_subreddits || [])).length,
      durationMs: (job.completedAt || Date.now()) - job.createdAt,
      timedOutCount: Array.from(new Set(job.timed_out_subreddits || [])).length,
    },
    error: job.error || null,
  };
}

async function resolveFetchContext(req, res) {
  const requestStart = Date.now();
  const timeBudget = createTimeBudget(requestStart);
  const fetchTimeoutMs = readNumber('REDDIT_FETCH_TIMEOUT_MS', DEFAULT_FETCH_TIMEOUT_MS);
  const fetchRetries = readNumber('REDDIT_FETCH_MAX_RETRIES', DEFAULT_FETCH_RETRIES);
  const tokenTimeoutMs = readNumber('REDDIT_TOKEN_TIMEOUT_MS', DEFAULT_TOKEN_TIMEOUT_MS);

  const tokenManager = createTokenManager(req, res, { timeBudget, tokenTimeoutMs });
  let fetchJSON;
  let authMode = 'oauth';
  try {
    const token = await tokenManager.ensureToken();
    if (token) {
      fetchJSON = createFetchJSON(tokenManager, {
        requestTimeoutMs: fetchTimeoutMs,
        defaultTries: fetchRetries,
      });
    } else {
      authMode = 'public';
      fetchJSON = createPublicFetchJSON({
        requestTimeoutMs: fetchTimeoutMs,
        defaultTries: Math.min(fetchRetries, 2),
      });
    }
  } catch (error) {
    const missingOAuthConfig = error?.message?.includes('Missing Reddit OAuth client credentials');
    const authFailure = error?.code === 'NOT_AUTHENTICATED' || error?.status === 401;
    if (!missingOAuthConfig && !authFailure) throw error;
    authMode = 'public';
    fetchJSON = createPublicFetchJSON({
      requestTimeoutMs: fetchTimeoutMs,
      defaultTries: Math.min(fetchRetries, 2),
    });
  }

  return {
    authMode,
    fetchJSON,
    timeBudget,
    fetchTimeoutMs,
  };
}

function parseRetryAfterSeconds(res) {
  const retryAfter = res?.headers?.get?.('Retry-After');
  if (!retryAfter) return 0;
  const asNum = Number(retryAfter);
  if (Number.isFinite(asNum) && asNum >= 0) return Math.ceil(asNum);
  const asDate = Date.parse(retryAfter);
  if (!Number.isNaN(asDate)) {
    const diff = Math.ceil((asDate - Date.now()) / 1000);
    return diff > 0 ? diff : 0;
  }
  return 0;
}

async function fetchJsonWithCooldown(url, context) {
  const sharedCooldown = await getExpiringValue(UPSTREAM_REDDIT_COOLDOWN_KEY);
  if (sharedCooldown?.ttlMs > 0) {
    const err = new Error('[RATE_LIMIT] Reddit cooldown active');
    err.code = 'RATE_LIMITED';
    err.retryAfterSeconds = Math.max(1, Math.ceil(sharedCooldown.ttlMs / 1000));
    throw err;
  }

  try {
    return await context.fetchJSON(url, { timeoutMs: context.timeBudget.safeTimeout(context.fetchTimeoutMs) });
  } catch (error) {
    if (error?.code === 'RATE_LIMITED') {
      const cooldownSeconds = Math.max(1, Number(error.retryAfterSeconds) || 15);
      await setExpiringValue(UPSTREAM_REDDIT_COOLDOWN_KEY, {
        source: 'reddit',
        retryAfterSeconds: cooldownSeconds,
        setAt: Date.now(),
      }, cooldownSeconds * 1000);
    }
    throw error;
  }
}

async function maybeFetchMeta(entry, context) {
  if (entry.meta) return;
  const cachedMeta = getCachedSubredditMeta(entry.subreddit);
  if (cachedMeta) {
    entry.meta = cachedMeta;
    return;
  }

  const redditBaseUrl = context.authMode === 'oauth' ? 'https://oauth.reddit.com' : 'https://www.reddit.com';
  const subInfoUrl = `${redditBaseUrl}/r/${encodeURIComponent(entry.subreddit)}/about.json`;
  const subInfo = await fetchJsonWithCooldown(subInfoUrl, context);
  if (subInfo?.data) {
    entry.meta = {
      subscribers: subInfo.data.subscribers,
      active_user_count: subInfo.data.active_user_count,
      title: subInfo.data.title || `r/${entry.subreddit}`,
      icon_img: subInfo.data.icon_img,
      description: subInfo.data.public_description || '',
    };
    setCachedSubredditMeta(entry.subreddit, entry.meta);
  }
}

async function advanceJob(job, req, res) {
  const now = Date.now();
  if (job.status === 'completed' || job.status === 'failed') return job;
  if (job.cooldown_until && job.cooldown_until > now) {
    job.status = 'cooldown';
    return job;
  }

  const context = await resolveFetchContext(req, res);
  job.auth_mode = context.authMode;
  job.status = 'running';
  job.startedAt = job.startedAt || now;
  job.cooldown_until = null;
  job.retry_after_seconds = 0;

  const cutoff = Math.floor(Date.now() / 1000) - job.days * 86400;
  const redditBaseUrl = context.authMode === 'oauth' ? 'https://oauth.reddit.com' : 'https://www.reddit.com';
  const maxPagesPerTick = Math.max(1, readNumber('REDDIT_JOB_MAX_PAGES_PER_TICK', 4));
  let processedPages = 0;

  while (processedPages < maxPagesPerTick && context.timeBudget.msRemaining() > 3500) {
    const entry = job.subreddits.find((subreddit) => !subreddit.done);
    if (!entry) {
      job.status = 'completed';
      job.completedAt = Date.now();
      return job;
    }

    try {
      await maybeFetchMeta(entry, context);
      const listingMode = job.mode === 'top' ? 'top' : 'new';
      const listingUrl = new URL(`${redditBaseUrl}/r/${encodeURIComponent(entry.subreddit)}/${listingMode}.json`);
      listingUrl.searchParams.set('limit', String(job.limit));
      listingUrl.searchParams.set('raw_json', '1');
      if (entry.after) listingUrl.searchParams.set('after', entry.after);
      if (listingMode === 'top') listingUrl.searchParams.set('t', job.time);

      const json = await fetchJsonWithCooldown(listingUrl.toString(), context);
      const posts = normalize(json);
      const includeAllAges = listingMode === 'top';

      for (const post of posts) {
        if (includeAllAges || (post.created_utc || 0) >= cutoff) {
          entry.posts.push(post);
        }
      }

      entry.after = json?.data?.after || '';
      entry.pageCount += 1;
      processedPages += 1;

      if (!posts.length || !entry.after) {
        entry.done = true;
      } else if (!includeAllAges) {
        const oldest = posts[posts.length - 1];
        if (!oldest || oldest.created_utc < cutoff) {
          entry.done = true;
        }
      }

      if (!job.fetch_all_pages && entry.pageCount >= job.max_pages) {
        entry.done = true;
        entry.partial = Boolean(entry.after);
      }
    } catch (error) {
      if (error?.code === 'RATE_LIMITED') {
        const retryAfterSeconds = Math.max(1, Number(error.retryAfterSeconds) || 15);
        job.status = 'cooldown';
        job.retry_after_seconds = retryAfterSeconds;
        job.cooldown_until = Date.now() + retryAfterSeconds * 1000;
        job.rate_limited_subreddits = Array.from(new Set([...(job.rate_limited_subreddits || []), entry.subreddit]));
        break;
      }

      if (error?.code === 'TIME_BUDGET_EXCEEDED' || error?.message === 'Request timeout') {
        job.timed_out_subreddits = Array.from(new Set([...(job.timed_out_subreddits || []), entry.subreddit]));
        break;
      }

      entry.done = true;
      entry.error = error.message;
      entry.error_code = error.code || 'FETCH_ERROR';
    }
  }

  if (job.subreddits.every((entry) => entry.done)) {
    job.status = 'completed';
    job.completedAt = Date.now();
  }

  job.updatedAt = Date.now();
  return job;
}

async function postHandler(req, res) {
  let body;
  try {
    body = await parseBody(req);
  } catch (_error) {
    return withCORS(req, res).status(400).json({ error: 'Invalid JSON body' });
  }

  const maxSubreddits = Math.max(1, readNumber('REDDIT_MAX_SUBREDDITS', 50));
  const subs = toArraySubs(body?.subs)
    .map((sub) => String(sub || '').trim())
    .filter(Boolean);

  if (!subs.length) {
    return withCORS(req, res).status(400).json({ error: 'Missing subs param' });
  }
  if (subs.length > maxSubreddits) {
    return withCORS(req, res).status(400).json({
      error: 'Too many subreddits',
      message: `Request at most ${maxSubreddits} subreddits per fetch job.`,
      max_subreddits: maxSubreddits,
      requested_subreddits: subs.length,
    });
  }
  for (const sub of subs) {
    if (!SUBREDDIT_REGEX.test(sub)) {
      return withCORS(req, res).status(400).json({
        error: 'Invalid subreddit name',
        message: `"${sub}" is not a valid subreddit name.`,
      });
    }
  }

  const mode = String(body?.mode || 'new').toLowerCase() === 'top' ? 'top' : 'new';
  const time = String(body?.time || 'day');
  const days = clampInt(body?.days, 1, 7, 1);
  const shape = parseRequestShape({
    subsCount: subs.length,
    limitParam: body?.limit,
    maxPagesParam: body?.max_pages,
  });
  const job = buildInitialJob({
    subs,
    mode,
    time,
    days,
    limit: shape.limit,
    maxPages: shape.maxPages,
    fetchAllPages: shape.fetchAllPages,
  });

  await storage.set(buildJobKey(job.id), job, JOB_TTL_SECONDS);
  return withCORS(req, res).status(202).json({ job: summarizeJob(job) });
}

async function getHandler(req, res, jobId) {
  const job = await storage.get(buildJobKey(jobId));
  if (!job) {
    return withCORS(req, res).status(404).json({ error: 'Job not found' });
  }

  let nextJob = job;
  try {
    nextJob = await advanceJob(job, req, res);
    await storage.set(buildJobKey(jobId), nextJob, JOB_TTL_SECONDS);
  } catch (error) {
    nextJob = {
      ...job,
      status: 'failed',
      error: {
        message: error.message,
        code: error.code || 'FETCH_JOB_FAILED',
      },
      updatedAt: Date.now(),
      completedAt: Date.now(),
    };
    await storage.set(buildJobKey(jobId), nextJob, JOB_TTL_SECONDS);
  }

  return withCORS(req, res).status(200).json({ job: summarizeJob(nextJob) });
}

module.exports = async function redditJobsHandler(req, res) {
  if (req.method === 'OPTIONS') {
    return withCORS(req, res, 'GET, POST, OPTIONS').status(204).end();
  }

  const { url } = parseRequest(req);
  if (req.method === 'POST' && url.pathname === '/api/reddit/jobs') {
    return postHandler(req, res);
  }

  if (req.method === 'GET') {
    const match = url.pathname.match(/^\/api\/reddit\/jobs\/([A-Za-z0-9_-]+)$/);
    if (match) {
      return getHandler(req, res, getQueryValue({ jobId: match[1] }, 'jobId', ''));
    }
  }

  return withCORS(req, res, 'GET, POST, OPTIONS').status(405).json({ error: 'Method not allowed' });
};
