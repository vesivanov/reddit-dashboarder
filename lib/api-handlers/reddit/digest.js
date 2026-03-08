// Digest Endpoint (Simplified)
//
// IMPORTANT: This endpoint no longer re-fetches Reddit or calls OpenRouter.
// It proxies the latest frontend-synced bundle from /api/sync/:token.
//
// Why: Reliability + simplicity. Frontend already fetches posts and has a "Sync with AI" button.
// The AI/agents should consume the exact same dataset the user sees.
//
// Usage:
//   GET /api/reddit/digest?token=SYNC_TOKEN
// Auth:
//   Authorization: Bearer <DIGEST_API_KEY>
//
// Env:
//   DIGEST_API_KEY       - required
//   DIGEST_SYNC_TOKEN    - optional default token

const { withCORS } = require('../../cors');
const { parseRequest, getQueryValue } = require('../../request-utils');

function verifyApiKey(req) {
  const apiKey = process.env.DIGEST_API_KEY;
  if (!apiKey) {
    return { valid: false, error: 'DIGEST_API_KEY not configured on server' };
  }

  const authHeader = req.headers.authorization || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return { valid: false, error: 'Missing or invalid Authorization header. Use: Bearer <token>' };
  }

  const provided = match[1].trim();
  if (provided !== apiKey) {
    return { valid: false, error: 'Invalid API key' };
  }

  return { valid: true };
}

function buildInternalAuthHeader() {
  const internalKey = process.env.DIGEST_API_KEY;
  if (!internalKey) return {};

  return {
    Authorization: `Bearer ${internalKey}`,
  };
}

function getBaseUrl(req) {
  // Vercel provides x-forwarded-proto and host
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = (req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  if (!host) return null;
  return `${proto}://${host}`;
}

module.exports = async function handler(req, res) {
  const startTime = Date.now();

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return withCORS(req, res).status(204).end();
  }

  if (req.method !== 'GET') {
    return withCORS(req, res).status(405).json({ error: 'Method not allowed' });
  }

  // Verify API key
  const authResult = verifyApiKey(req);
  if (!authResult.valid) {
    return withCORS(req, res).status(401).json({ error: authResult.error });
  }

  try {
    const { query } = parseRequest(req);
    const token = getQueryValue(query, 'token', process.env.DIGEST_SYNC_TOKEN || '').trim();

    if (!token) {
      return withCORS(req, res).status(400).json({
        error: 'Missing sync token',
        message: 'Provide ?token=... from the frontend “Sync with AI” button, or set DIGEST_SYNC_TOKEN env var.',
        example: '/api/reddit/digest?token=YOUR_SYNC_TOKEN',
      });
    }

    const baseUrl = getBaseUrl(req);
    if (!baseUrl) {
      return withCORS(req, res).status(500).json({
        error: 'Unable to determine base URL',
        message: 'Missing host header',
      });
    }

    const syncUrl = `${baseUrl}/api/sync/${encodeURIComponent(token)}`;

    const r = await fetch(syncUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...buildInternalAuthHeader(),
      },
    });

    const text = await r.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (e) {
      return withCORS(req, res).status(502).json({
        error: 'Upstream returned invalid JSON',
        upstreamStatus: r.status,
        upstreamBodyPreview: (text || '').slice(0, 200),
      });
    }

    if (!r.ok) {
      return withCORS(req, res).status(r.status).json({
        error: 'Sync fetch failed',
        upstreamStatus: r.status,
        upstream: data,
      });
    }

    // Return the sync payload as-is, plus digest metadata for convenience
    return withCORS(req, res).status(200).json({
      source: 'sync',
      token,
      fetchedAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      ...data,
    });
  } catch (err) {
    console.error('[digest->sync] Error:', err);
    return withCORS(req, res).status(500).json({
      error: 'Internal server error',
      message: err.message,
      durationMs: Date.now() - startTime,
    });
  }
};
