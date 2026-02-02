// Token Store - Vercel KV integration for persistent refresh token storage
// Falls back to environment variable if KV is not configured
//
// Environment variables:
//   KV_REST_API_URL    - Vercel KV REST API URL (auto-set by Vercel)
//   KV_REST_API_TOKEN  - Vercel KV REST API token (auto-set by Vercel)
//   REDDIT_REFRESH_TOKEN - Fallback if KV not available

const KV_KEY = 'reddit_refresh_token';
const KV_UPDATED_KEY = 'reddit_refresh_token_updated';

// Check if Vercel KV is configured
function isKVConfigured() {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

// Lazy-load @vercel/kv to avoid errors when not installed
let kvModule = null;
function getKV() {
  if (!kvModule && isKVConfigured()) {
    try {
      kvModule = require('@vercel/kv');
    } catch (err) {
      console.warn('[token-store] @vercel/kv not installed, using env var fallback');
      kvModule = false;
    }
  }
  return kvModule || null;
}

/**
 * Get the Reddit refresh token
 * Priority: Vercel KV > Environment variable
 * @returns {Promise<{token: string|null, source: string}>}
 */
async function getRefreshToken() {
  // Try Vercel KV first
  const kv = getKV();
  if (kv) {
    try {
      const token = await kv.get(KV_KEY);
      if (token) {
        return { token, source: 'kv' };
      }
    } catch (err) {
      console.error('[token-store] KV read error:', err.message);
    }
  }

  // Fallback to environment variable
  const envToken = process.env.REDDIT_REFRESH_TOKEN;
  if (envToken) {
    return { token: envToken, source: 'env' };
  }

  return { token: null, source: 'none' };
}

/**
 * Save the Reddit refresh token to Vercel KV
 * @param {string} token - The refresh token to save
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function saveRefreshToken(token) {
  const kv = getKV();
  if (!kv) {
    return { 
      success: false, 
      error: 'Vercel KV not configured. Set KV_REST_API_URL and KV_REST_API_TOKEN, or add Vercel KV to your project.' 
    };
  }

  try {
    await kv.set(KV_KEY, token);
    await kv.set(KV_UPDATED_KEY, new Date().toISOString());
    console.log('[token-store] Refresh token saved to KV');
    return { success: true };
  } catch (err) {
    console.error('[token-store] KV write error:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Get token metadata (for admin/debugging)
 * @returns {Promise<{hasToken: boolean, source: string, updatedAt?: string}>}
 */
async function getTokenInfo() {
  const { token, source } = await getRefreshToken();
  
  let updatedAt = null;
  if (source === 'kv') {
    const kv = getKV();
    if (kv) {
      try {
        updatedAt = await kv.get(KV_UPDATED_KEY);
      } catch (err) {
        // ignore
      }
    }
  }

  return {
    hasToken: !!token,
    source,
    ...(updatedAt && { updatedAt }),
    ...(token && { tokenPreview: `${token.slice(0, 8)}...${token.slice(-4)}` }),
  };
}

/**
 * Delete the refresh token from KV (for logout/reset)
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function deleteRefreshToken() {
  const kv = getKV();
  if (!kv) {
    return { success: false, error: 'Vercel KV not configured' };
  }

  try {
    await kv.del(KV_KEY);
    await kv.del(KV_UPDATED_KEY);
    console.log('[token-store] Refresh token deleted from KV');
    return { success: true };
  } catch (err) {
    console.error('[token-store] KV delete error:', err.message);
    return { success: false, error: err.message };
  }
}

module.exports = {
  isKVConfigured,
  getRefreshToken,
  saveRefreshToken,
  getTokenInfo,
  deleteRefreshToken,
};
