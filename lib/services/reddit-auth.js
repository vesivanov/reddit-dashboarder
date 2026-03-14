const { readSignedCookie, makeSignedCookie, clearCookie } = require('../cookies');
const { getRedditUserAgent, isPublicRedditFallbackAllowed } = require('./reddit-runtime');

const USER_AGENT = getRedditUserAgent();
const TOKEN_ENDPOINT = 'https://www.reddit.com/api/v1/access_token';
const DEFAULT_TOKEN_TIMEOUT_MS = 10000;
const MIN_PER_REQUEST_TIMEOUT_MS = 1000;

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

async function requestTokenRefresh(refreshTokenValue, { timeoutMs = DEFAULT_TOKEN_TIMEOUT_MS, timeBudget } = {}) {
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  const userAgent = getRedditUserAgent();

  if (!clientId || !clientSecret) {
    throw new Error('Missing Reddit OAuth client credentials');
  }

  let effectiveTimeout = Math.max(MIN_PER_REQUEST_TIMEOUT_MS, Number(timeoutMs) || DEFAULT_TOKEN_TIMEOUT_MS);
  if (timeBudget) {
    try {
      effectiveTimeout = Math.min(effectiveTimeout, timeBudget.safeTimeout(effectiveTimeout));
    } catch (err) {
      err.message = 'Processing time limit exceeded before refreshing access token';
      throw err;
    }
  }

  const form = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshTokenValue,
  });

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), effectiveTimeout);

  let response;
  try {
    response = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': userAgent,
      },
      body: form.toString(),
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      const timeoutErr = new Error('Token refresh timeout');
      timeoutErr.code = 'TOKEN_REFRESH_TIMEOUT';
      throw timeoutErr;
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const text = await response.text();
    const error = new Error(`Refresh token request failed: ${text}`);
    error.status = response.status;
    throw error;
  }

  return response.json();
}

function createTokenManager(req, res, options = {}) {
  const { timeBudget = null, tokenTimeoutMs = DEFAULT_TOKEN_TIMEOUT_MS } = options || {};
  let access = readSignedCookie(req, 'access');
  let refresh = readSignedCookie(req, 'refresh');
  let refreshingPromise = null;

  async function refreshAccessToken() {
    if (!refresh) return null;
    if (!refreshingPromise) {
      refreshingPromise = (async () => {
        console.log('Token manager: refreshing Reddit access token');
        const data = await requestTokenRefresh(refresh, { timeoutMs: tokenTimeoutMs, timeBudget });
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

module.exports = {
  DEFAULT_TOKEN_TIMEOUT_MS,
  MIN_PER_REQUEST_TIMEOUT_MS,
  USER_AGENT,
  appendSetCookie,
  requestTokenRefresh,
  createTokenManager,
  isPublicRedditFallbackAllowed,
};
