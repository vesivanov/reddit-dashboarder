// Vercel API Route — Reddit multi-day paginator + resilient fetching + CORS
// Usage example:
//   GET /api/reddit?subs=programming,technology&mode=new&days=3&limit=100&max_pages=30

const { readSignedCookie, makeSignedCookie, clearCookie } = require('../lib/cookies');

// More realistic User-Agent to avoid Reddit blocking
const DEFAULT_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const USER_AGENT = process.env.REDDIT_USER_AGENT || DEFAULT_UA;
const TOKEN_ENDPOINT = 'https://www.reddit.com/api/v1/access_token';

const DEFAULT_FETCH_TIMEOUT_MS = 7000;
const DEFAULT_FETCH_RETRIES = 2;
const DEFAULT_FUNCTION_TIMEOUT_MS = 30000;
const DEFAULT_TIMEOUT_BUFFER_MS = 3000;
const MIN_TIME_BUDGET_MS = 1000;
const MIN_PER_REQUEST_TIMEOUT_MS = 1000;

function readNumber(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function createTimeBudget(requestStartMs) {
  const totalMs = readNumber('API_MAX_RUNTIME_MS', readNumber('VERCEL_TIMEOUT_MS', DEFAULT_FUNCTION_TIMEOUT_MS));
  const bufferMs = readNumber('API_TIMEOUT_BUFFER_MS', DEFAULT_TIMEOUT_BUFFER_MS);
  const budgetMs = Math.max(MIN_TIME_BUDGET_MS, totalMs - bufferMs);
  const deadline = requestStartMs + budgetMs;

  function msRemaining() {
    return deadline - Date.now();
  }

  function ensure(message) {
    if (msRemaining() <= 0) {
      const err = new Error(message || 'Processing time limit exceeded');
      err.code = 'TIME_BUDGET_EXCEEDED';
      throw err;
    }
  }

  function safeTimeout(desiredTimeoutMs) {
    const fallback = Number.isFinite(desiredTimeoutMs) ? desiredTimeoutMs : DEFAULT_FETCH_TIMEOUT_MS;
    const remaining = msRemaining();
    if (remaining <= MIN_PER_REQUEST_TIMEOUT_MS + 250) {
      const err = new Error('Processing time limit exceeded');
      err.code = 'TIME_BUDGET_EXCEEDED';
      throw err;
    }
    const safeWindow = Math.min(fallback, remaining - 250);
    return Math.max(MIN_PER_REQUEST_TIMEOUT_MS, safeWindow);
  }

  return {
    budgetMs,
    deadline,
    ensure,
    msRemaining,
    safeTimeout,
  };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function appendSetCookie(res, cookie) {
  if (!cookie) return;
  const existing = res.getHeader('Set-Cookie');
  if (!existing) {
    res.setHeader('Set-Cookie', [cookie]);
  } else if (Array.isArray(existing)) {
    res.setHeader('Set-Cookie', existing.concat(cookie));
  } else {
    res.setHeader('Set-Cookie', [existing, cookie]);
  }
}

async function requestTokenRefresh(refreshTokenValue) {
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  const userAgent = process.env.REDDIT_USER_AGENT || USER_AGENT;

  if (!clientId || !clientSecret) {
    throw new Error('Missing Reddit OAuth client credentials');
  }

  const form = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshTokenValue,
  });

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': userAgent,
    },
    body: form.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    const error = new Error(`Refresh token request failed: ${text}`);
    error.status = response.status;
    throw error;
  }

  return response.json();
}

function createTokenManager(req, res) {
  let access = readSignedCookie(req, 'access');
  let refresh = readSignedCookie(req, 'refresh');
  let refreshingPromise = null;

  async function refreshAccessToken() {
    if (!refresh) return null;
    if (!refreshingPromise) {
      refreshingPromise = (async () => {
        console.log('Token manager: refreshing Reddit access token');
        const data = await requestTokenRefresh(refresh);
        access = data.access_token;
        const accessMaxAge = Math.max(0, (data.expires_in || 3600) - 10);
        appendSetCookie(res, makeSignedCookie('access', access, { maxAge: accessMaxAge }));
        if (data.refresh_token) {
          refresh = data.refresh_token;
          appendSetCookie(res, makeSignedCookie('refresh', refresh, { maxAge: 60 * 60 * 24 * 30 }));
        }
        return access;
      })().catch((err) => {
        console.error('Token manager: refresh failed', err);
        access = null;
        refresh = null;
        appendSetCookie(res, clearCookie('access'));
        appendSetCookie(res, clearCookie('refresh'));
        throw err;
      }).finally(() => {
        refreshingPromise = null;
      });
    }
    return refreshingPromise;
  }

  async function ensureToken() {
    if (access) return access;
    return refreshAccessToken();
  }

  return {
    ensureToken,
    refreshAccessToken,
    hasRefresh: () => Boolean(refresh),
  };
}

function toOAuthUrl(inputUrl) {
  try {
    const parsed = new URL(inputUrl);
    if (parsed.hostname.endsWith('reddit.com') && parsed.hostname !== 'oauth.reddit.com') {
      parsed.hostname = 'oauth.reddit.com';
    }
    return parsed.toString();
  } catch (err) {
    console.warn('Unable to normalise URL for OAuth, using original:', inputUrl, err.message);
    return inputUrl;
  }
}

function createFetchJSON(tokenManager, { requestTimeoutMs = 10000, defaultTries = 3 } = {}) {
  return async function fetchJSON(url, { tries = defaultTries, baseDelay = 400, timeoutMs } = {}) {
    let attempt = 0;
    let lastErr;
    console.log(`fetchJSON: Starting request to ${url} (max ${tries} tries)`);

    while (attempt < tries) {
      let refreshed = false;

      while (true) {
        let token;
        try {
          token = await tokenManager.ensureToken();
        } catch (tokenErr) {
          throw tokenErr;
        }

        if (!token) {
          const err = new Error('Not authenticated');
          err.code = 'NOT_AUTHENTICATED';
          throw err;
        }

        const targetUrl = toOAuthUrl(url);
        console.log(`fetchJSON: Attempt ${attempt + 1}/${tries} for ${targetUrl}`);

        const requestedTimeout = Number.isFinite(timeoutMs) ? Number(timeoutMs) : requestTimeoutMs;
        const effectiveTimeout = Math.max(MIN_PER_REQUEST_TIMEOUT_MS, requestedTimeout);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), effectiveTimeout);

        try {
          const res = await fetch(targetUrl, {
            headers: {
              'User-Agent': USER_AGENT,
              'Accept': 'application/json, text/plain, */*',
              'Accept-Language': 'en-US,en;q=0.9',
              'Cache-Control': 'no-cache',
              'Pragma': 'no-cache',
              Authorization: `Bearer ${token}`,
            },
            signal: controller.signal,
          });
          clearTimeout(timeoutId);

          console.log(`fetchJSON: Got response ${res.status} ${res.statusText} for ${targetUrl}`);

          const text = await res.text();
          console.log(`fetchJSON: Response body length: ${text.length} chars`);

          if (res.status === 401) {
            if (tokenManager.hasRefresh() && !refreshed) {
              console.warn('fetchJSON: Access token expired, attempting refresh');
              try {
                const newToken = await tokenManager.refreshAccessToken();
                if (!newToken) {
                  const err = new Error('Not authenticated');
                  err.code = 'NOT_AUTHENTICATED';
                  throw err;
                }
                refreshed = true;
                continue;
              } catch (refreshErr) {
                lastErr = refreshErr;
                break;
              }
            }
            const err = new Error('Not authenticated');
            err.status = 401;
            err.code = 'NOT_AUTHENTICATED';
            throw err;
          }

          if (res.status === 429) {
            const errorMsg = `[RATE_LIMIT] Rate limited by Reddit: ${text.slice(0,120)}`;
            console.error(`fetchJSON: ${errorMsg}`);
            throw new Error(errorMsg);
          }

          if (res.status === 403) {
            const errorMsg = `[RATE_LIMIT] Reddit is blocking requests (403 Forbidden). This is likely due to rate limiting or IP restrictions. Try again later or use Reddit OAuth for higher limits.`;
            console.error(`fetchJSON: ${errorMsg}`);
            throw new Error(errorMsg);
          }

          if (!res.ok) {
            const errorMsg = `Upstream ${res.status}: ${text.slice(0,120)}`;
            console.error(`fetchJSON: ${errorMsg}`);
            throw new Error(errorMsg);
          }

          if (text.includes('Too Many Requests') || text.includes('<!doctype html>')) {
            const errorMsg = '[RATE_LIMIT] Reddit is rate limiting requests. Please wait a few minutes and try again. Consider using Reddit OAuth for higher limits.';
            console.error(`fetchJSON: ${errorMsg}`);
            throw new Error(errorMsg);
          }

          try {
            const json = JSON.parse(text);
            console.log(`fetchJSON: Successfully parsed JSON for ${targetUrl}`);
            return json;
          } catch (parseErr) {
            const errorMsg = 'Invalid JSON body';
            console.error(`fetchJSON: ${errorMsg}. Body preview: ${text.slice(0, 200)}`);
            throw new Error(errorMsg);
          }
        } catch (err) {
          clearTimeout(timeoutId);
          if (err.code === 'NOT_AUTHENTICATED') {
            throw err;
          }

          if (err.name === 'AbortError') {
            console.error(`fetchJSON: Request aborted for ${targetUrl}`);
            err = new Error('Request timeout');
          }

          if (err.status === 401 && refreshed) {
            err.code = 'NOT_AUTHENTICATED';
            throw err;
          }

          lastErr = err;
          console.error(`fetchJSON: Attempt ${attempt + 1} failed for ${targetUrl}:`, err.message);
          break;
        }
      }

      attempt += 1;
      if (attempt < tries) {
        const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 250;
        console.log(`fetchJSON: Waiting ${Math.round(delay)}ms before retry ${attempt + 1}/${tries}`);
        await sleep(delay);
      }
    }

    console.error(`fetchJSON: All ${tries} attempts failed for ${url}`);
    if (lastErr && lastErr.code === 'NOT_AUTHENTICATED') {
      throw lastErr;
    }
    throw lastErr || new Error('fetchJSON failed');
  };
}

// run a list of async tasks with limited concurrency and delays
async function runWithConcurrency(tasks, limit = 3) { // Slightly higher concurrency to reduce total time
  const results = new Array(tasks.length);
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const i = next++;
      try { 
        // Add delay between subreddit requests to avoid rate limiting
        if (i > 0) {
          await sleep(300 + Math.random() * 300);
        }
        results[i] = await tasks[i](); 
      }
      catch (e) { results[i] = { error: e.message }; }
    }
  }
  const pool = Array.from({ length: Math.min(limit, tasks.length) }, worker);
  await Promise.all(pool);
  return results;
}

function normalize(data) {
  const children = data?.data?.children || [];
  return children.map(child => {
    const post = child.data || {};
    const parsedScore = Number(post.score);
    const fallbackScore = Number(post.ups);
    const safeScore = Number.isFinite(parsedScore)
      ? parsedScore
      : (Number.isFinite(fallbackScore) ? fallbackScore : 0);
    const parsedComments = Number(post.num_comments);
    const fallbackComments = Number(post.comments);
    const safeComments = Number.isFinite(parsedComments)
      ? parsedComments
      : (Number.isFinite(fallbackComments) ? fallbackComments : 0);
    return {
      id: post.id,
      subreddit: post.subreddit,
      title: post.title,
      selftext: post.selftext || '',
      selftext_html: post.selftext_html || '',
      author: post.author,
      // Preserve both Reddit permalink and external URL
      reddit_url: `https://www.reddit.com${post.permalink}`,
      external_url: post.url || '',
      domain: post.domain,
      score: safeScore,
      num_comments: safeComments,
      created_utc: post.created_utc,
      thumbnail: validThumb(post.thumbnail) ? post.thumbnail : null,
      link_flair_text: post.link_flair_text || '',
      link_flair_background_color: post.link_flair_background_color || '',
      link_flair_text_color: post.link_flair_text_color || '',
    };
  });
}

function validThumb(thumbnail) {
  if (!thumbnail) return false;
  return !['self', 'default', 'nsfw', 'image', 'spoiler'].includes(thumbnail);
}

function clampInt(value, min, max, fallback) {
  const parsed = parseInt(value || '', 10);
  if (Number.isFinite(parsed)) {
    return Math.max(min, Math.min(max, parsed));
  }
  return fallback;
}

const { withCORS } = require('../lib/cors');

async function handler(req, res) {
  const isDev = process.env.NODE_ENV !== 'production';
  const requestStart = Date.now();
  const timeBudget = createTimeBudget(requestStart);
  const fetchTimeoutMs = readNumber('REDDIT_FETCH_TIMEOUT_MS', DEFAULT_FETCH_TIMEOUT_MS);
  const fetchRetries = readNumber('REDDIT_FETCH_MAX_RETRIES', DEFAULT_FETCH_RETRIES);

  // Only log in development, and sanitize sensitive data
  if (isDev) {
    console.log('=== API Request Started ===');
    console.log('Method:', req.method);
    console.log('URL:', req.url);
    console.log('Query:', req.query);
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

  const { subs, mode = 'new', time = 'day', days = '1', limit = '100', max_pages = '5' } = req.query;
  if (isDev) console.log('Parsed parameters:', { subs, mode, time, days, limit, max_pages });

  // Validate subreddit names: 2-21 alphanumeric chars or underscores
  const SUBREDDIT_REGEX = /^[A-Za-z0-9_]{2,21}$/;
  const subsArray = (subs || '').split(',').map(s => s.trim()).filter(Boolean);

  for (const sub of subsArray) {
    if (!SUBREDDIT_REGEX.test(sub)) {
      if (isDev) console.log('Error: Invalid subreddit name:', sub);
      return withCORS(req, res).status(400).json({
        error: 'Invalid subreddit name',
        message: `"${sub}" is not a valid subreddit name. Names must be 2-21 alphanumeric characters or underscores.`
      });
    }
  }
  const modeValue = mode.toLowerCase();
  const daysValue = clampInt(days, 1, 7, 1);
  const limitValue = clampInt(limit, 25, 100, 100);
  const maxPagesValue = clampInt(max_pages, 1, 10, 5);

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

  const tokenManager = createTokenManager(req, res);
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

    // Create tasks for each subreddit with concurrency control
    const tasks = subsArray.map(sub => async () => {
      if (isDev) console.log(`Starting fetch for subreddit: r/${sub}`);
      try {
        ensureTime(`Time limit reached before processing r/${sub}`);
        // Try to fetch subreddit metadata, but fallback to basic info if it fails
        let meta = {
          subscribers: null,
          active_user_count: null,
          title: `r/${sub}`,
          icon_img: null,
          description: '',
        };

        // Try to get subreddit info
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
            if (isDev) console.log(`Got metadata for r/${sub}: ${meta.subscribers} subscribers`);
          }
        } catch (metaError) {
          if (metaError.code === 'TIME_BUDGET_EXCEEDED') throw metaError;
          if (isDev) console.log(`Could not fetch metadata for r/${sub}: ${metaError.message}`);
          // Keep the default meta object with null values
        }

        if (modeValue === 'top') {
          if (isDev) console.log(`Fetching top posts for r/${sub} with time=${time}, limit=${limitValue}`);
          // Try multiple endpoints - some might be less blocked
          let posts = [];
          const endpoints = [
            `https://www.reddit.com/r/${encodeURIComponent(sub)}/top.json?t=${encodeURIComponent(time)}&limit=${limitValue}&raw_json=1`,
            `https://www.reddit.com/r/${encodeURIComponent(sub)}.json?sort=top&t=${encodeURIComponent(time)}&limit=${limitValue}`,
            `https://old.reddit.com/r/${encodeURIComponent(sub)}/top.json?t=${encodeURIComponent(time)}&limit=${limitValue}`
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
        if (isDev) console.error(`Error processing r/${sub}:`, e.message);
        return { subreddit: sub, error: e.message, posts: [], partial: false };
      }
    });

    if (isDev) console.log('Running tasks with concurrency limit of 3 and delays...');
    const perSubResults = await runWithConcurrency(tasks, 3);
    const results = perSubResults;
    if (isDev) {
      console.log('All subreddit tasks completed. Results:', results.map(r => ({
        subreddit: r.subreddit,
        postCount: r.posts?.length || 0,
        hasError: !!r.error
      })));
    }

    const rateLimited = results.some(r => (r?.error || '').includes('[RATE_LIMIT]'));
    const timedOutSubs = results.filter(r => r?.timed_out).map(r => r.subreddit);
    const totalPosts = results.reduce((sum, r) => sum + (r.posts?.length || 0), 0);
    const rateLimitedCount = results.filter(r => (r?.error || '').includes('[RATE_LIMIT]')).length;
    const metrics = {
      subredditCount: results.length,
      totalPosts,
      rateLimitedCount,
      durationMs: Date.now() - requestStart,
      timedOutCount: timedOutSubs.length,
    };

    const responseData = {
      mode: modeValue,
      time,
      days: daysValue,
      limit: limitValue,
      max_pages: maxPagesValue,
      results,
      fetched_at: Date.now(),
      rate_limited: rateLimited,
      timed_out: timedOutSubs.length > 0,
      ...(timedOutSubs.length > 0 && { timed_out_subreddits: timedOutSubs }),
      metrics,
    };

    // Set cache headers
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=600');
    if (rateLimited) {
      res.setHeader('X-Rate-Limited', '1');
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
