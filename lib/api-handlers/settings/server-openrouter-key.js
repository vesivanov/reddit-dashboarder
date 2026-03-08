// Server-side OpenRouter API Key Storage
// Stores key in Redis/KV for server-side use (digest endpoint)
// Auth: Bearer token via DIGEST_API_KEY env var
//
// POST /api/settings/server/openrouter-key
//   Body: { apiKey: "sk-or-v1-..." }
//
// GET /api/settings/server/openrouter-key
//   Returns: { hasKey: true, source: "persistent-store", keyPreview: "sk-or...e5" }

const { withCORS } = require('../../cors');
const { saveOpenRouterKey, getOpenRouterKeyInfo, deleteOpenRouterKey } = require('../../credential-stores/openrouter-key-store');

function verifyApiKey(req) {
  const apiKey = process.env.DIGEST_API_KEY;
  if (!apiKey) {
    return { valid: false, error: 'DIGEST_API_KEY not configured on server' };
  }
  
  const authHeader = req.headers.authorization || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return { valid: false, error: 'Missing Authorization header. Use: Bearer <token>' };
  }
  
  const provided = match[1].trim();
  if (provided !== apiKey) {
    return { valid: false, error: 'Invalid API key' };
  }
  
  return { valid: true };
}

module.exports = async function handler(req, res) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return withCORS(req, res).status(204).end();
  }

  // Verify API key for all methods
  const authResult = verifyApiKey(req);
  if (!authResult.valid) {
    return withCORS(req, res).status(401).json({ error: authResult.error });
  }

  // GET - Check stored key status
  if (req.method === 'GET') {
    const info = await getOpenRouterKeyInfo();
    return withCORS(req, res).status(200).json(info);
  }

  // POST - Store API key
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
        return withCORS(req, res).status(400).json({ error: 'Invalid JSON body' });
      }
    }

    const { apiKey } = body || {};
    
    if (!apiKey || typeof apiKey !== 'string') {
      return withCORS(req, res).status(400).json({ error: 'apiKey is required' });
    }

    // Basic validation
    const trimmedKey = apiKey.trim();
    if (trimmedKey.length < 20 || trimmedKey.length > 200) {
      return withCORS(req, res).status(400).json({ error: 'Invalid API key length' });
    }

    const result = await saveOpenRouterKey(trimmedKey);
    if (result.success) {
      return withCORS(req, res).status(200).json({
        success: true,
        keyPreview: `sk-or...${trimmedKey.slice(-4)}`,
      });
    } else {
      return withCORS(req, res).status(500).json({
        error: 'Failed to save API key',
        message: result.error,
      });
    }
  }

  // DELETE - Remove stored key
  if (req.method === 'DELETE') {
    const result = await deleteOpenRouterKey();
    if (result.success) {
      return withCORS(req, res).status(200).json({ success: true, message: 'Key removed (if existed)' });
    }

    return withCORS(req, res).status(500).json({
      error: 'Failed to delete API key',
      message: result.error,
    });
  }

  return withCORS(req, res).status(405).json({ error: 'Method not allowed' });
};
