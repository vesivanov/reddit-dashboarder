// Secure endpoint for storing OpenRouter API key in HttpOnly cookie
// This prevents XSS attacks from stealing the API key

const { readSignedCookie, makeSignedCookie, clearCookie } = require('../../lib/cookies');
const { withCORS } = require('../../lib/cors');

module.exports = async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return withCORS(req, res, 'GET, POST, DELETE, OPTIONS').status(204).end();
  }

  // GET - Check if API key is stored (returns boolean, never the key itself)
  if (req.method === 'GET') {
    const storedKey = readSignedCookie(req, 'openrouter_key');
    return withCORS(req, res, 'GET, POST, DELETE, OPTIONS').status(200).json({
      hasKey: Boolean(storedKey),
      // Return masked preview if key exists (first 8 chars + ...)
      keyPreview: storedKey ? `sk-or...${storedKey.slice(-4)}` : null,
    });
  }

  // POST - Store API key securely
  if (req.method === 'POST') {
    let body;
    if (req.body && typeof req.body === 'object' && req.body !== null) {
      body = req.body;
    } else {
      try {
        body = await new Promise((resolve, reject) => {
          let data = '';
          req.on('data', chunk => { data += chunk; });
          req.on('end', () => {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              reject(e);
            }
          });
          req.on('error', reject);
        });
      } catch (parseError) {
        return withCORS(req, res, 'GET, POST, DELETE, OPTIONS').status(400).json({ error: 'Invalid JSON body' });
      }
    }

    if (!body || typeof body !== 'object') {
      return withCORS(req, res, 'GET, POST, DELETE, OPTIONS').status(400).json({ error: 'Request body is required' });
    }

    const { apiKey } = body;

    if (!apiKey || typeof apiKey !== 'string') {
      return withCORS(req, res, 'GET, POST, DELETE, OPTIONS').status(400).json({ error: 'apiKey is required' });
    }

    // Basic validation - OpenRouter keys typically start with sk-or-
    const trimmedKey = apiKey.trim();
    if (trimmedKey.length < 20) {
      return withCORS(req, res, 'GET, POST, DELETE, OPTIONS').status(400).json({ error: 'Invalid API key format' });
    }

    // Store in HttpOnly signed cookie (expires in 1 year)
    const cookie = makeSignedCookie('openrouter_key', trimmedKey, { maxAge: 60 * 60 * 24 * 365 });
    res.setHeader('Set-Cookie', cookie);

    return withCORS(req, res, 'GET, POST, DELETE, OPTIONS').status(200).json({
      success: true,
      keyPreview: `sk-or...${trimmedKey.slice(-4)}`,
    });
  }

  // DELETE - Remove stored API key
  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', clearCookie('openrouter_key'));
    return withCORS(req, res, 'GET, POST, DELETE, OPTIONS').status(200).json({ success: true });
  }

  return withCORS(req, res, 'GET, POST, DELETE, OPTIONS').status(405).json({ error: 'Method not allowed' });
};
