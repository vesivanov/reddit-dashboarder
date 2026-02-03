// Admin Token Endpoint
// View and manage the stored Reddit refresh token
//
// GET  /api/admin/token - View token status and metadata
// POST /api/admin/token - Manually set refresh token (body: { token: "..." })
// DELETE /api/admin/token - Delete stored token from KV
//
// Authentication: Bearer token via DIGEST_API_KEY env var

const { withCORS } = require('../../cors');
const { 
  getTokenInfo, 
  saveRefreshToken, 
  deleteRefreshToken,
  isKVConfigured 
} = require('../../token-store');

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

async function handler(req, res) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return withCORS(req, res, 'GET, POST, DELETE, OPTIONS').status(204).end();
  }

  // Verify API key for all methods
  const authResult = verifyApiKey(req);
  if (!authResult.valid) {
    return withCORS(req, res, 'GET, POST, DELETE, OPTIONS').status(401).json({ error: authResult.error });
  }

  // GET - View token info
  if (req.method === 'GET') {
    try {
      const tokenInfo = await getTokenInfo();
      return withCORS(req, res, 'GET, POST, DELETE, OPTIONS').status(200).json({
        ...tokenInfo,
        kvConfigured: isKVConfigured(),
        envVarSet: !!process.env.REDDIT_REFRESH_TOKEN,
      });
    } catch (err) {
      return withCORS(req, res, 'GET, POST, DELETE, OPTIONS').status(500).json({ 
        error: 'Failed to get token info', 
        message: err.message 
      });
    }
  }

  // POST - Manually set token
  if (req.method === 'POST') {
    try {
      // Parse body
      let body;
      if (req.body && typeof req.body === 'object') {
        body = req.body;
      } else {
        body = await new Promise((resolve, reject) => {
          let data = '';
          req.on('data', chunk => { data += chunk; });
          req.on('end', () => {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              reject(new Error('Invalid JSON body'));
            }
          });
          req.on('error', reject);
        });
      }

      const { token } = body;
      if (!token || typeof token !== 'string') {
        return withCORS(req, res, 'GET, POST, DELETE, OPTIONS').status(400).json({ 
          error: 'Missing or invalid token in request body' 
        });
      }

      const result = await saveRefreshToken(token.trim());
      if (result.success) {
        return withCORS(req, res, 'GET, POST, DELETE, OPTIONS').status(200).json({ 
          success: true,
          message: 'Refresh token saved to Vercel KV' 
        });
      } else {
        return withCORS(req, res, 'GET, POST, DELETE, OPTIONS').status(500).json({ 
          error: 'Failed to save token',
          message: result.error 
        });
      }
    } catch (err) {
      return withCORS(req, res, 'GET, POST, DELETE, OPTIONS').status(500).json({ 
        error: 'Failed to save token', 
        message: err.message 
      });
    }
  }

  // DELETE - Remove token from KV
  if (req.method === 'DELETE') {
    try {
      const result = await deleteRefreshToken();
      if (result.success) {
        return withCORS(req, res, 'GET, POST, DELETE, OPTIONS').status(200).json({ 
          success: true,
          message: 'Refresh token deleted from Vercel KV' 
        });
      } else {
        return withCORS(req, res, 'GET, POST, DELETE, OPTIONS').status(500).json({ 
          error: 'Failed to delete token',
          message: result.error 
        });
      }
    } catch (err) {
      return withCORS(req, res, 'GET, POST, DELETE, OPTIONS').status(500).json({ 
        error: 'Failed to delete token', 
        message: err.message 
      });
    }
  }

  return withCORS(req, res, 'GET, POST, DELETE, OPTIONS').status(405).json({ error: 'Method not allowed' });
}

module.exports = handler;
