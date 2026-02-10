// API endpoint for importing/exporting dashboard settings
// Allows AI agents to read and write user settings

const { readSignedCookie, makeSignedCookie, clearCookie } = require('../../cookies');
const { withCORS } = require('../../cors');

const SETTINGS_COOKIE_NAME = 'dashboard_settings';
const MAX_SETTINGS_SIZE = 50000; // 50KB limit for settings JSON

module.exports = async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return withCORS(req, res, 'GET, POST, DELETE, OPTIONS').status(204).end();
  }

  // GET - Export settings (returns stored settings)
  if (req.method === 'GET') {
    const storedSettings = readSignedCookie(req, SETTINGS_COOKIE_NAME);
    if (!storedSettings) {
      return withCORS(req, res, 'GET, POST, DELETE, OPTIONS').status(200).json({
        hasSettings: false,
        settings: null,
      });
    }

    try {
      const settings = JSON.parse(storedSettings);
      return withCORS(req, res, 'GET, POST, DELETE, OPTIONS').status(200).json({
        hasSettings: true,
        settings,
      });
    } catch (parseError) {
      // Corrupted cookie, clear it
      res.setHeader('Set-Cookie', clearCookie(SETTINGS_COOKIE_NAME));
      return withCORS(req, res, 'GET, POST, DELETE, OPTIONS').status(200).json({
        hasSettings: false,
        settings: null,
      });
    }
  }

  // POST - Import settings (store settings)
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
        return withCORS(req, res, 'GET, POST, DELETE, OPTIONS').status(400).json({ 
          error: 'Invalid JSON body' 
        });
      }
    }

    if (!body || typeof body !== 'object') {
      return withCORS(req, res, 'GET, POST, DELETE, OPTIONS').status(400).json({ 
        error: 'Request body is required' 
      });
    }

    // Validate settings structure
    const settings = {
      subs: Array.isArray(body.subs) ? body.subs : [],
      maxPages: typeof body.maxPages === 'number' ? Math.max(1, Math.min(10, body.maxPages)) : undefined,
      autoRefreshEnabled: typeof body.autoRefreshEnabled === 'boolean' ? body.autoRefreshEnabled : undefined,
      autoRefreshInterval: typeof body.autoRefreshInterval === 'number' ? body.autoRefreshInterval : undefined,
      notificationsEnabled: typeof body.notificationsEnabled === 'boolean' ? body.notificationsEnabled : undefined,
      upvoteThreshold: typeof body.upvoteThreshold === 'number' ? body.upvoteThreshold : undefined,
      alertKeywords: typeof body.alertKeywords === 'string' ? body.alertKeywords : undefined,
      notifyHighRelevance: typeof body.notifyHighRelevance === 'boolean' ? body.notifyHighRelevance : undefined,
      highRelevanceThreshold: typeof body.highRelevanceThreshold === 'number' 
        ? Math.max(0, Math.min(5, body.highRelevanceThreshold)) 
        : undefined,
      notifiedHighRelevancePostIds: Array.isArray(body.notifiedHighRelevancePostIds) 
        ? body.notifiedHighRelevancePostIds 
        : undefined,
      aiGoals: typeof body.aiGoals === 'string' ? body.aiGoals : undefined,
      aiContext: typeof body.aiContext === 'string' ? body.aiContext : undefined,
      aiEnabled: typeof body.aiEnabled === 'boolean' ? body.aiEnabled : undefined,
      // Note: openRouterApiKey should be stored via /api/settings/openrouter-key for security
      // We don't store it here, but we can include openRouterModel
      openRouterModel: typeof body.openRouterModel === 'string' ? body.openRouterModel : undefined,
      aiLlmPostLimit: typeof body.aiLlmPostLimit === 'number' ? body.aiLlmPostLimit : undefined,
    };

    // Remove undefined values
    Object.keys(settings).forEach(key => {
      if (settings[key] === undefined) {
        delete settings[key];
      }
    });

    // Serialize and check size
    const settingsJson = JSON.stringify(settings);
    if (settingsJson.length > MAX_SETTINGS_SIZE) {
      return withCORS(req, res, 'GET, POST, DELETE, OPTIONS').status(400).json({ 
        error: 'Settings payload too large (max 50KB)' 
      });
    }

    // Store in HttpOnly signed cookie (expires in 1 year)
    const cookie = makeSignedCookie(SETTINGS_COOKIE_NAME, settingsJson, { 
      maxAge: 60 * 60 * 24 * 365 
    });
    res.setHeader('Set-Cookie', cookie);

    return withCORS(req, res, 'GET, POST, DELETE, OPTIONS').status(200).json({
      success: true,
      settings,
    });
  }

  // DELETE - Clear stored settings
  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', clearCookie(SETTINGS_COOKIE_NAME));
    return withCORS(req, res, 'GET, POST, DELETE, OPTIONS').status(200).json({ 
      success: true 
    });
  }

  return withCORS(req, res, 'GET, POST, DELETE, OPTIONS').status(405).json({ 
    error: 'Method not allowed' 
  });
};
