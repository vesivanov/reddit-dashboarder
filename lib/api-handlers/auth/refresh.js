// Token refresh endpoint - proactively refresh Reddit access token
// GET /api/auth/refresh
// Returns: { success: true, authenticated: true } or error

const { readSignedCookie, makeSignedCookie, clearCookie } = require('../../cookies');
const { withCORS } = require('../../cors');
const { getRedditUserAgent } = require('../../services/reddit-runtime');

const TOKEN_ENDPOINT = 'https://www.reddit.com/api/v1/access_token';
const USER_AGENT = getRedditUserAgent();

async function refreshAccessToken(refreshToken) {
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Missing Reddit OAuth configuration');
  }

  const form = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT,
    },
    body: form.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    const err = new Error(`Token refresh failed: ${text}`);
    err.status = response.status;
    throw err;
  }

  return response.json();
}

module.exports = async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return withCORS(req, res, 'GET, OPTIONS').status(204).end();
  }

  if (req.method !== 'GET') {
    return withCORS(req, res).status(405).json({ error: 'Method not allowed' });
  }

  const refreshToken = readSignedCookie(req, 'refresh');

  if (!refreshToken) {
    return withCORS(req, res).status(401).json({
      error: 'No refresh token',
      message: 'Please authenticate with Reddit first',
    });
  }

  try {
    const data = await refreshAccessToken(refreshToken);

    // Set new access token cookie
    const accessMaxAge = Math.max(0, (data.expires_in || 3600) - 10);
    const cookies = [
      makeSignedCookie('access', data.access_token, { maxAge: accessMaxAge }),
    ];

    // Update refresh token if rotated
    if (data.refresh_token) {
      cookies.push(makeSignedCookie('refresh', data.refresh_token, { maxAge: 60 * 60 * 24 * 30 }));
    }

    res.setHeader('Set-Cookie', cookies);

    return withCORS(req, res).status(200).json({
      success: true,
      authenticated: true,
      expiresIn: data.expires_in,
    });
  } catch (error) {
    console.error('[auth/refresh] Token refresh failed:', error);

    // Clear invalid cookies
    res.setHeader('Set-Cookie', [clearCookie('access'), clearCookie('refresh')]);

    const status = error.status || 500;
    return withCORS(req, res).status(status).json({
      error: 'Token refresh failed',
      message: error.message,
      code: status === 401 ? 'INVALID_REFRESH_TOKEN' : 'REFRESH_FAILED',
    });
  }
};
