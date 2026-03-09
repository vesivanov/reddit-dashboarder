const DEFAULT_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const USER_AGENT = process.env.REDDIT_USER_AGENT || DEFAULT_UA;

const DEFAULT_FETCH_TIMEOUT_MS = 7000;
const DEFAULT_FETCH_RETRIES = 2;
const DEFAULT_FUNCTION_TIMEOUT_MS = 60000;
const DEFAULT_TIMEOUT_BUFFER_MS = 3000;
const MIN_TIME_BUDGET_MS = 1000;
const MIN_PER_REQUEST_TIMEOUT_MS = 1000;
const SUBREDDIT_META_TTL_MS = readNumber('SUBREDDIT_META_TTL_MS', 6 * 60 * 60 * 1000);
const subredditMetaCache = new Map();

function readNumber(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function createTimeBudget(requestStartMs) {
  const defaultRuntimeMs = process.env.VERCEL ? 60000 : DEFAULT_FUNCTION_TIMEOUT_MS;
  const totalMs = readNumber('API_MAX_RUNTIME_MS', readNumber('VERCEL_TIMEOUT_MS', defaultRuntimeMs));
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getCachedSubredditMeta(subreddit) {
  const key = String(subreddit || '').toLowerCase();
  if (!key) return null;
  const record = subredditMetaCache.get(key);
  if (!record) return null;
  if (Date.now() > record.expiresAt) {
    subredditMetaCache.delete(key);
    return null;
  }
  return record.value;
}

function setCachedSubredditMeta(subreddit, value) {
  const key = String(subreddit || '').toLowerCase();
  if (!key || !value) return;
  subredditMetaCache.set(key, {
    value,
    expiresAt: Date.now() + SUBREDDIT_META_TTL_MS,
  });
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

function toPublicUrl(inputUrl) {
  try {
    const parsed = new URL(inputUrl);
    if (parsed.hostname === 'oauth.reddit.com') {
      parsed.hostname = 'www.reddit.com';
    }
    return parsed.toString();
  } catch (err) {
    console.warn('Unable to normalise URL for public fetch, using original:', inputUrl, err.message);
    return inputUrl;
  }
}

function parseRetryAfterSeconds(res) {
  const retryAfter = res?.headers?.get?.('Retry-After');
  if (retryAfter) {
    const asNum = Number(retryAfter);
    if (Number.isFinite(asNum) && asNum >= 0) return Math.ceil(asNum);
    const asDate = Date.parse(retryAfter);
    if (!Number.isNaN(asDate)) {
      const diff = Math.ceil((asDate - Date.now()) / 1000);
      if (diff > 0) return diff;
    }
  }

  const resetHeader = res?.headers?.get?.('x-ratelimit-reset');
  if (resetHeader) {
    const asNum = Number(resetHeader);
    if (Number.isFinite(asNum) && asNum >= 0) return Math.ceil(asNum);
  }

  return null;
}

function makeRateLimitError(message, { retryAfterSeconds = null, status = 429 } = {}) {
  const err = new Error(message || '[RATE_LIMIT] Upstream rate limited');
  err.code = 'RATE_LIMITED';
  err.status = status;
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
    err.retryAfterSeconds = Math.ceil(retryAfterSeconds);
  }
  return err;
}

function createRedditFetcher({ tokenManager = null, requestTimeoutMs = 10000, defaultTries = 3, useOAuth = true } = {}) {
  return async function fetchJSON(url, { tries = defaultTries, baseDelay = 400, timeoutMs } = {}) {
    let attempt = 0;
    let lastErr;
    console.log(`fetchJSON: Starting request to ${url} (max ${tries} tries)`);

    while (attempt < tries) {
      let refreshed = false;

      while (true) {
        let token = null;
        if (tokenManager) {
          try {
            token = await tokenManager.ensureToken();
          } catch (tokenErr) {
            throw tokenErr;
          }
        }

        if (tokenManager && !token) {
          const err = new Error('Not authenticated');
          err.code = 'NOT_AUTHENTICATED';
          throw err;
        }

        const targetUrl = useOAuth ? toOAuthUrl(url) : toPublicUrl(url);
        console.log(`fetchJSON: Attempt ${attempt + 1}/${tries} for ${targetUrl}`);

        const requestedTimeout = Number.isFinite(timeoutMs) ? Number(timeoutMs) : requestTimeoutMs;
        const effectiveTimeout = Math.max(MIN_PER_REQUEST_TIMEOUT_MS, requestedTimeout);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), effectiveTimeout);

        try {
          const res = await fetch(targetUrl, {
            headers: {
              'User-Agent': USER_AGENT,
              Accept: 'application/json, text/plain, */*',
              'Accept-Language': 'en-US,en;q=0.9',
              'Cache-Control': 'no-cache',
              Pragma: 'no-cache',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            signal: controller.signal,
          });
          clearTimeout(timeoutId);

          console.log(`fetchJSON: Got response ${res.status} ${res.statusText} for ${targetUrl}`);

          const text = await res.text();
          console.log(`fetchJSON: Response body length: ${text.length} chars`);

          if (res.status === 401) {
            if (tokenManager && tokenManager.hasRefresh() && !refreshed) {
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
            const retryAfterSeconds = parseRetryAfterSeconds(res);
            const errorMsg = `[RATE_LIMIT] Rate limited by Reddit: ${text.slice(0, 120)}`;
            console.error(`fetchJSON: ${errorMsg}`);
            throw makeRateLimitError(errorMsg, { retryAfterSeconds, status: 429 });
          }

          if (res.status === 403) {
            const retryAfterSeconds = parseRetryAfterSeconds(res);
            const errorMsg = '[RATE_LIMIT] Reddit is blocking requests (403 Forbidden). This is likely due to rate limiting or IP restrictions. Try again later or use Reddit OAuth for higher limits.';
            console.error(`fetchJSON: ${errorMsg}`);
            throw makeRateLimitError(errorMsg, { retryAfterSeconds, status: 403 });
          }

          if (!res.ok) {
            const errorMsg = `Upstream ${res.status}: ${text.slice(0, 120)}`;
            console.error(`fetchJSON: ${errorMsg}`);
            throw new Error(errorMsg);
          }

          if (text.includes('Too Many Requests') || text.includes('<!doctype html>')) {
            const errorMsg = '[RATE_LIMIT] Reddit is rate limiting requests. Please wait a few minutes and try again. Consider using Reddit OAuth for higher limits.';
            console.error(`fetchJSON: ${errorMsg}`);
            throw makeRateLimitError(errorMsg, { retryAfterSeconds: 15, status: 429 });
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
          if (err.code === 'NOT_AUTHENTICATED') throw err;

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
          if (err.code === 'RATE_LIMITED') {
            attempt = tries;
          }
          break;
        }
      }

      attempt += 1;
      if (attempt < tries) {
        const explicitRetry = Number(lastErr?.retryAfterSeconds);
        const delay = Number.isFinite(explicitRetry) && explicitRetry > 0
          ? explicitRetry * 1000
          : (baseDelay * Math.pow(2, attempt - 1) + Math.random() * 250);
        console.log(`fetchJSON: Waiting ${Math.round(delay)}ms before retry ${attempt + 1}/${tries}`);
        await sleep(delay);
      }
    }

    console.error(`fetchJSON: All ${tries} attempts failed for ${url}`);
    if (lastErr && lastErr.code === 'NOT_AUTHENTICATED') throw lastErr;
    throw lastErr || new Error('fetchJSON failed');
  };
}

function createFetchJSON(tokenManager, { requestTimeoutMs = 10000, defaultTries = 3 } = {}) {
  return createRedditFetcher({ tokenManager, requestTimeoutMs, defaultTries, useOAuth: true });
}

function createPublicFetchJSON({ requestTimeoutMs = 10000, defaultTries = 2 } = {}) {
  return createRedditFetcher({ tokenManager: null, requestTimeoutMs, defaultTries, useOAuth: false });
}

async function runWithConcurrency(tasks, {
  initialLimit = 2,
  getCurrentLimit,
  interTaskDelayMs = () => 300 + Math.random() * 300,
} = {}) {
  const results = new Array(tasks.length);
  let next = 0;
  let active = 0;

  return new Promise((resolve) => {
    const launchMore = () => {
      const dynamicLimit = Math.max(1, Number(getCurrentLimit ? getCurrentLimit() : initialLimit) || initialLimit);

      while (active < dynamicLimit && next < tasks.length) {
        const i = next++;
        active += 1;

        (async () => {
          try {
            if (i > 0) {
              const delay = interTaskDelayMs(i);
              if (delay > 0) await sleep(delay);
            }
            results[i] = await tasks[i]();
          } catch (e) {
            results[i] = { error: e.message };
          } finally {
            active -= 1;
            if (next >= tasks.length && active === 0) {
              resolve(results);
              return;
            }
            launchMore();
          }
        })();
      }

      if (next >= tasks.length && active === 0) {
        resolve(results);
      }
    };

    launchMore();
  });
}

function normalize(data) {
  const children = data?.data?.children || [];
  return children.map((child) => {
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

module.exports = {
  DEFAULT_FETCH_TIMEOUT_MS,
  DEFAULT_FETCH_RETRIES,
  createTimeBudget,
  sleep,
  readNumber,
  getCachedSubredditMeta,
  setCachedSubredditMeta,
  createFetchJSON,
  createPublicFetchJSON,
  runWithConcurrency,
  normalize,
  clampInt,
};
