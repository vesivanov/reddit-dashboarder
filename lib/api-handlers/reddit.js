// Vercel API Route — Reddit multi-day paginator + resilient fetching + CORS
// Usage example:
//   GET /api/reddit?subs=programming,technology&mode=new&days=3&limit=100&max_pages=30

const { parseRequest, getQueryValue } = require('../request-utils');
const { createTokenManager, DEFAULT_TOKEN_TIMEOUT_MS } = require('../services/reddit-auth');
const {
  DEFAULT_FETCH_TIMEOUT_MS,
  DEFAULT_FETCH_RETRIES,
  createTimeBudget,
  sleep,
  readNumber,
  getCachedSubredditMeta,
  setCachedSubredditMeta,
  createFetchJSON,
  runWithConcurrency,
  normalize,
  clampInt,
} = require('../services/reddit-fetch');

const { withCORS } = require('../cors');

async function handler(req, res) {
  const isDev = process.env.NODE_ENV !== 'production';
  const requestStart = Date.now();
  const timeBudget = createTimeBudget(requestStart);
  const fetchTimeoutMs = readNumber('REDDIT_FETCH_TIMEOUT_MS', DEFAULT_FETCH_TIMEOUT_MS);
  const fetchRetries = readNumber('REDDIT_FETCH_MAX_RETRIES', DEFAULT_FETCH_RETRIES);
  const tokenTimeoutMs = readNumber('REDDIT_TOKEN_TIMEOUT_MS', DEFAULT_TOKEN_TIMEOUT_MS);
  const { url: absoluteUrl, query: querySnapshot } = parseRequest(req);

  // Only log in development, and sanitize sensitive data
  if (isDev) {
    console.log('=== API Request Started ===');
    console.log('Method:', req.method);
    console.log('URL:', absoluteUrl.pathname + absoluteUrl.search);
    console.log('Query snapshot:', querySnapshot);
    // Sanitize headers - remove sensitive data
    const { cookie, authorization, ...safeHeaders } = req.headers;
    console.log('Headers:', JSON.stringify(safeHeaders, null, 2));
    console.log('Timestamp:', new Date().toISOString());
    console.log('Time budget (ms):', timeBudget.budgetMs, 'Fetch timeout (ms):', fetchTimeoutMs, 'Retries:', fetchRetries);
  }

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    if (isDev) console.log('Handling CORS preflight request');
    return withCORS(req, res).status(204).end();
  }

  if (req.method !== 'GET') {
    if (isDev) console.log('Method not allowed:', req.method);
    return withCORS(req, res).status(405).json({ error: 'Method not allowed' });
  }

  const subsParam = getQueryValue(querySnapshot, 'subs', '');
  const modeParam = getQueryValue(querySnapshot, 'mode', 'new');
  const timeParam = getQueryValue(querySnapshot, 'time', 'day');
  const daysParam = getQueryValue(querySnapshot, 'days', '1');
  const limitParam = getQueryValue(querySnapshot, 'limit', '100');
  const maxPagesParam = getQueryValue(querySnapshot, 'max_pages', '5');
  if (isDev) console.log('Parsed parameters:', { subs: subsParam, mode: modeParam, time: timeParam, days: daysParam, limit: limitParam, max_pages: maxPagesParam });

  // Validate subreddit names: 2-21 alphanumeric chars or underscores
  const SUBREDDIT_REGEX = /^[A-Za-z0-9_]{2,21}$/;
  const subsArray = (subsParam || '').split(',').map(s => s.trim()).filter(Boolean);

  for (const sub of subsArray) {
    if (!SUBREDDIT_REGEX.test(sub)) {
      if (isDev) console.log('Error: Invalid subreddit name:', sub);
      return withCORS(req, res).status(400).json({
        error: 'Invalid subreddit name',
        message: `"${sub}" is not a valid subreddit name. Names must be 2-21 alphanumeric characters or underscores.`
      });
    }
  }
  const modeValue = (modeParam || 'new').toLowerCase();
  const daysValue = clampInt(daysParam, 1, 7, 1);
  const limitValue = clampInt(limitParam, 25, 100, 100);
  const maxPagesValue = clampInt(maxPagesParam, 1, 10, 5);
  const timeValue = timeParam || 'day';

  if (isDev) {
    console.log('Processed parameters:', {
      subsArray,
      modeValue,
      daysValue,
      limitValue,
      maxPagesValue
    });
  }

  if (!subsArray.length) {
    if (isDev) console.log('Error: No subreddits provided');
      return withCORS(req, res).status(400).json({ error: 'Missing subs param' });
  }

  const tokenManager = createTokenManager(req, res, { timeBudget, tokenTimeoutMs });
  let fetchJSON;
  try {
    const token = await tokenManager.ensureToken();
    if (!token) {
      if (isDev) console.log('No Reddit access token found; user must authenticate');
      return withCORS(req, res).status(401).json({ error: 'Not authenticated' });
    }
    fetchJSON = createFetchJSON(tokenManager, {
      requestTimeoutMs: fetchTimeoutMs,
      defaultTries: fetchRetries,
    });
  } catch (error) {
    if (isDev) console.error('Error establishing Reddit token manager:', error.message);

    const missingOAuthConfig = error?.message?.includes('Missing Reddit OAuth client credentials');
    if (missingOAuthConfig) {
      return withCORS(req, res).status(401).json({
        error: 'Not authenticated',
        message: 'Reddit OAuth is not configured on the server. Add REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET.',
      });
    }

    return withCORS(req, res).status(500).json({ error: 'OAuth configuration error', message: error.message });
  }

  try {
    const cutoff = Math.floor(Date.now() / 1000) - daysValue * 86400;
    if (isDev) console.log('Starting data fetch with cutoff timestamp:', cutoff, 'for', subsArray.length, 'subreddits');

    const fetchWithBudget = (url, options = {}) => {
      try {
        const desiredTimeout = options.timeoutMs ?? fetchTimeoutMs;
        const timeoutMs = timeBudget.safeTimeout(desiredTimeout);
        return fetchJSON(url, { ...options, timeoutMs });
      } catch (err) {
        if (err.code === 'TIME_BUDGET_EXCEEDED') {
          err.message = `Processing time limit exceeded before requesting ${url}`;
        }
        throw err;
      }
    };

    const ensureTime = (contextMessage) => {
      timeBudget.ensure(contextMessage);
    };

    const rateLimitState = {
      active: false,
      retryAfterSeconds: 0,
    };

    // Create tasks for each subreddit with concurrency control
    const tasks = subsArray.map(sub => async () => {
      if (isDev) console.log(`Starting fetch for subreddit: r/${sub}`);
      try {
        ensureTime(`Time limit reached before processing r/${sub}`);
        if (rateLimitState.active && rateLimitState.retryAfterSeconds > 0) {
          const backoffMs = Math.min(15000, rateLimitState.retryAfterSeconds * 1000);
          if (isDev) console.warn(`Rate limit active, delaying r/${sub} by ${backoffMs}ms`);
          await sleep(backoffMs);
        }
        // Try to fetch subreddit metadata, but fallback to basic info if it fails
        let meta = {
          subscribers: null,
          active_user_count: null,
          title: `r/${sub}`,
          icon_img: null,
          description: '',
        };

        const cachedMeta = getCachedSubredditMeta(sub);
        if (cachedMeta) {
          meta = cachedMeta;
          if (isDev) console.log(`Using cached metadata for r/${sub}`);
        } else if (!rateLimitState.active) {
          // Try to get subreddit info (skip if rate limited)
          try {
            if (isDev) console.log(`Attempting to fetch metadata for r/${sub}`);
            const subInfoUrl = `https://oauth.reddit.com/r/${encodeURIComponent(sub)}/about.json`;
            const subInfo = await fetchWithBudget(subInfoUrl);
            if (subInfo?.data) {
              meta = {
                subscribers: subInfo.data.subscribers,
                active_user_count: subInfo.data.active_user_count,
                title: subInfo.data.title || `r/${sub}`,
                icon_img: subInfo.data.icon_img,
                description: subInfo.data.public_description || '',
              };
              setCachedSubredditMeta(sub, meta);
              if (isDev) console.log(`Got metadata for r/${sub}: ${meta.subscribers} subscribers`);
            }
          } catch (metaError) {
            if (metaError.code === 'TIME_BUDGET_EXCEEDED') throw metaError;
            if (metaError.code === 'RATE_LIMITED') {
              rateLimitState.active = true;
              rateLimitState.retryAfterSeconds = Math.max(rateLimitState.retryAfterSeconds, Number(metaError.retryAfterSeconds) || 5);
            }
            if (isDev) console.log(`Could not fetch metadata for r/${sub}: ${metaError.message}`);
            // Keep the default meta object with null values
          }
        }

        if (modeValue === 'top') {
          if (isDev) console.log(`Fetching top posts for r/${sub} with time=${timeValue}, limit=${limitValue}`);
          // Try multiple endpoints - some might be less blocked
          let posts = [];
          const endpoints = [
            `https://www.reddit.com/r/${encodeURIComponent(sub)}/top.json?t=${encodeURIComponent(timeValue)}&limit=${limitValue}&raw_json=1`,
            `https://www.reddit.com/r/${encodeURIComponent(sub)}.json?sort=top&t=${encodeURIComponent(timeValue)}&limit=${limitValue}`,
            `https://old.reddit.com/r/${encodeURIComponent(sub)}/top.json?t=${encodeURIComponent(timeValue)}&limit=${limitValue}`
          ];

          for (const endpoint of endpoints) {
            try {
              if (isDev) console.log(`Trying endpoint: ${endpoint}`);
              ensureTime(`Time limit reached before fetching top posts for r/${sub}`);
              const top = await fetchWithBudget(endpoint);
              posts = normalize(top);
              if (posts.length > 0) {
                if (isDev) console.log(`Got ${posts.length} top posts for r/${sub} from ${endpoint}`);
                break;
              }
            } catch (e) {
              if (isDev) console.log(`Endpoint failed: ${endpoint} - ${e.message}`);
              if (e.code === 'TIME_BUDGET_EXCEEDED') throw e;
              if (e.code === 'RATE_LIMITED') throw e;
              continue;
            }
          }
          return { subreddit: sub, meta, posts, partial: false };
        }

        // mode === 'new' with pagination - try multiple endpoints
        if (isDev) console.log(`Fetching new posts for r/${sub} with pagination (max ${maxPagesValue} pages)`);
        let after = '';
        let page = 0;
        const collected = [];

        // Try different endpoints for new posts
        const baseEndpoints = [
          `https://www.reddit.com/r/${encodeURIComponent(sub)}/new.json`,
          `https://www.reddit.com/r/${encodeURIComponent(sub)}.json`,
          `https://old.reddit.com/r/${encodeURIComponent(sub)}/new.json`
        ];

        let workingEndpoint = null;
        for (const baseEp of baseEndpoints) {
          try {
            const testEp = `${baseEp}?limit=1&raw_json=1`;
            if (isDev) console.log(`Testing endpoint: ${testEp}`);
            ensureTime(`Time limit reached before endpoint test for r/${sub}`);
            await fetchWithBudget(testEp, { tries: 1 });
            workingEndpoint = baseEp;
            if (isDev) console.log(`Found working endpoint: ${baseEp}`);
            break;
          } catch (e) {
            if (isDev) console.log(`Endpoint failed: ${baseEp} - ${e.message}`);
            if (e.code === 'TIME_BUDGET_EXCEEDED') throw e;
            if (e.code === 'RATE_LIMITED') throw e;
            continue;
          }
        }

        if (!workingEndpoint) {
          throw new Error('All Reddit endpoints are blocked');
        }

        while (page < maxPagesValue) {
          const ep = `${workingEndpoint}?limit=${limitValue}${after ? `&after=${after}` : ''}&raw_json=1`;
          if (isDev) console.log(`Page ${page + 1} for r/${sub}: ${ep}`);
          ensureTime(`Time limit reached before page fetch for r/${sub}`);
          const json = await fetchWithBudget(ep);
          const posts = normalize(json);
          if (isDev) console.log(`Page ${page + 1} returned ${posts.length} posts for r/${sub}`);
          if (!posts.length) break;

          for (const p of posts) if ((p.created_utc || 0) >= cutoff) collected.push(p);

          after = json?.data?.after || '';
          page += 1;

          const oldest = posts[posts.length - 1];
          if (!after || !oldest || oldest.created_utc < cutoff) break;

          // modest pause between pages to avoid rate limiting while keeping things fast
          await sleep(250 + Math.random() * 250);
        }
        if (isDev) console.log(`Collected ${collected.length} posts from r/${sub} across ${page} pages`);
        const capped = page >= maxPagesValue;
        let partial = false;
        if (capped && collected.length) {
          const oldest = collected[collected.length - 1];
          if ((oldest.created_utc || 0) >= cutoff) partial = true;
        }
        if (isDev) console.log(`Finished processing r/${sub}: ${collected.length} posts, partial=${partial}`);
        return { subreddit: sub, meta, posts: collected, partial };
      } catch (e) {
        if (e.code === 'TIME_BUDGET_EXCEEDED') {
          if (isDev) console.warn(`Time budget exceeded while processing r/${sub}`);
          return {
            subreddit: sub,
            error: 'Processing time limit exceeded before this subreddit completed',
            posts: [],
            partial: false,
            timed_out: true,
          };
        }
        if (e.code === 'RATE_LIMITED') {
          const retryAfterSeconds = Number(e.retryAfterSeconds) || 0;
          if (retryAfterSeconds > rateLimitState.retryAfterSeconds) {
            rateLimitState.retryAfterSeconds = retryAfterSeconds;
          }
          rateLimitState.active = true;
          return {
            subreddit: sub,
            error: e.message,
            error_code: 'RATE_LIMITED',
            retry_after_seconds: retryAfterSeconds || undefined,
            posts: [],
            partial: false,
          };
        }
        if (isDev) console.error(`Error processing r/${sub}:`, e.message);
        return { subreddit: sub, error: e.message, posts: [], partial: false };
      }
    });

    if (isDev) console.log('Running tasks with adaptive concurrency (2 -> 1 on rate-limit)...');
    const perSubResults = await runWithConcurrency(tasks, {
      initialLimit: 2,
      getCurrentLimit: () => (rateLimitState.active ? 1 : 2),
      interTaskDelayMs: () => (rateLimitState.active ? 1000 + Math.random() * 1500 : 300 + Math.random() * 300),
    });
    const results = perSubResults;
    if (isDev) {
      console.log('All subreddit tasks completed. Results:', results.map(r => ({
        subreddit: r.subreddit,
        postCount: r.posts?.length || 0,
        hasError: !!r.error
      })));
    }

    const rateLimitedSubs = results.filter(r => r?.error_code === 'RATE_LIMITED' || (r?.error || '').includes('[RATE_LIMIT]'));
    const rateLimited = rateLimitedSubs.length > 0;
    const retryAfterSeconds = Math.max(0, ...rateLimitedSubs.map(r => Number(r?.retry_after_seconds) || 0));
    const timedOutSubs = results.filter(r => r?.timed_out).map(r => r.subreddit);
    const totalPosts = results.reduce((sum, r) => sum + (r.posts?.length || 0), 0);
    const rateLimitedCount = rateLimitedSubs.length;
    const metrics = {
      subredditCount: results.length,
      totalPosts,
      rateLimitedCount,
      durationMs: Date.now() - requestStart,
      timedOutCount: timedOutSubs.length,
      retryAfterSeconds,
    };

    const responseData = {
      mode: modeValue,
      time: timeValue,
      days: daysValue,
      limit: limitValue,
      max_pages: maxPagesValue,
      results,
      fetched_at: Date.now(),
      rate_limited: rateLimited,
      ...(rateLimited && {
        rate_limited_subreddits: rateLimitedSubs.map(r => r.subreddit).filter(Boolean),
        ...(retryAfterSeconds > 0 && { retry_after_seconds: retryAfterSeconds }),
      }),
      timed_out: timedOutSubs.length > 0,
      ...(timedOutSubs.length > 0 && { timed_out_subreddits: timedOutSubs }),
      metrics,
    };

    // Set cache headers
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=600');
    if (rateLimited) {
      res.setHeader('X-Rate-Limited', '1');
      if (retryAfterSeconds > 0) {
        res.setHeader('Retry-After', String(retryAfterSeconds));
      }
    }
    if (timedOutSubs.length > 0) {
      res.setHeader('X-RDD-Timed-Out', String(timedOutSubs.length));
    }
    try {
      res.setHeader('X-RDD-Metrics', JSON.stringify(metrics));
    } catch (setErr) {
      if (isDev) console.warn('Unable to set metrics header:', setErr.message);
    }

    if (isDev) {
      console.log('=== API Request Completed Successfully ===');
      console.log('Response data summary:', {
        mode: responseData.mode,
        resultCount: responseData.results.length,
        totalPosts: responseData.results.reduce((sum, r) => sum + (r.posts?.length || 0), 0)
      });
    }

    return withCORS(req, res).status(200).json(responseData);
  } catch (error) {
    if (isDev) {
      console.error('=== API Request Failed ===');
      console.error('Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
    } else {
      // In production, only log minimal error info
      console.error('API Request Failed:', error.message);
    }

    if (error.code === 'NOT_AUTHENTICATED' || error.status === 401) {
      return withCORS(req, res).status(401).json({ error: 'Not authenticated' });
    }

    const errorMetrics = {
      subredditCount: 0,
      totalPosts: 0,
      rateLimitedCount: 0,
      durationMs: Date.now() - requestStart,
      error: error.code || error.status || 'ERROR',
    };
    try {
      res.setHeader('X-RDD-Metrics', JSON.stringify(errorMetrics));
    } catch (setErr) {
      if (isDev) console.warn('Unable to set metrics header on error:', setErr.message);
    }

    return withCORS(req, res).status(500).json({
      error: 'Internal server error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

// Export for both Vercel and Express, and expose helpers for testing
module.exports = handler;
module.exports.createTokenManager = createTokenManager;
module.exports.createFetchJSON = createFetchJSON;
module.exports.runWithConcurrency = runWithConcurrency;
module.exports.normalize = normalize;
