// Token Store - Redis-backed persistent refresh token storage
// Supports Upstash Redis (Vercel Marketplace) and legacy Vercel KV
// Falls back to REDDIT_REFRESH_TOKEN env var if no store is configured
//
// Environment variables (Upstash – recommended):
//   UPSTASH_REDIS_REST_URL    - From Vercel Redis/Upstash integration
//   UPSTASH_REDIS_REST_TOKEN  - From Vercel Redis/Upstash integration
//
// Alternative – REST (some integrations):
//   REDIS_URL   - https REST URL (token in REDIS_TOKEN or embedded in URL)
//   REDIS_TOKEN - Optional if token is in REDIS_URL as user:password
//
// Alternative – TCP (Redis Labs, etc.):
//   REDIS_URL   - redis:// URL (e.g. redis://default:password@host:port)
//
// Legacy (Vercel KV, deprecated):
//   KV_REST_API_URL, KV_REST_API_TOKEN
//
// Fallback:
//   REDDIT_REFRESH_TOKEN - Used when no Redis/KV is configured

const KV_KEY = 'reddit_refresh_token';
const KV_UPDATED_KEY = 'reddit_refresh_token_updated';
const KV_OPENROUTER_KEY = 'openrouter_api_key';
const KV_OPENROUTER_UPDATED_KEY = 'openrouter_api_key_updated';

function isUpstashConfigured() {
  return !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

// REDIS_URL with https (Upstash REST)
function isRedisUrlConfigured() {
  const url = process.env.REDIS_URL;
  if (!url || typeof url !== 'string' || !url.startsWith('https://')) return false;
  const hasToken =
    process.env.REDIS_TOKEN ||
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    (url.includes('@') && url.split('@')[0].includes(':'));
  return !!hasToken;
}

// REDIS_URL with redis:// (Redis Labs, etc. – TCP)
function isRedisTcpConfigured() {
  const url = process.env.REDIS_URL;
  return !!(url && typeof url === 'string' && url.startsWith('redis://'));
}

function isLegacyKVConfigured() {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

// Check if any Redis/KV store is configured
function isKVConfigured() {
  return isUpstashConfigured() || isRedisUrlConfigured() || isRedisTcpConfigured() || isLegacyKVConfigured();
}

// Lazy-loaded store: { get, set, del } or null
let storeInstance = null;

function getStore() {
  if (storeInstance !== null) {
    return storeInstance;
  }

  // Prefer Upstash (Vercel Marketplace Redis)
  if (isUpstashConfigured()) {
    try {
      const { Redis } = require('@upstash/redis');
      const redis = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      });
      storeInstance = {
        get: (key) => redis.get(key),
        set: (key, value) => redis.set(key, value),
        del: (key) => redis.del(key),
      };
      return storeInstance;
    } catch (err) {
      console.warn('[token-store] @upstash/redis failed:', err.message);
    }
  }

  // REDIS_URL (https) + token – some integrations set these instead of UPSTASH_*
  if (isRedisUrlConfigured()) {
    let url = process.env.REDIS_URL;
    let token =
      process.env.REDIS_TOKEN ||
      process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!token && url.includes('@')) {
      try {
        const u = new URL(url);
        if (u.username && u.password) {
          token = u.password;
          url = `${u.protocol}//${u.host}`;
        }
      } catch (e) {
        // ignore
      }
    }
    if (url && token) {
      try {
        const { Redis } = require('@upstash/redis');
        const redis = new Redis({ url, token });
        storeInstance = {
          get: (key) => redis.get(key),
          set: (key, value) => redis.set(key, value),
          del: (key) => redis.del(key),
        };
        return storeInstance;
      } catch (err) {
        console.warn('[token-store] REDIS_URL + token failed:', err.message);
      }
    }
  }

  // REDIS_URL redis:// (Redis Labs, etc. – TCP via node-redis)
  if (isRedisTcpConfigured()) {
    try {
      const { createClient } = require('redis');
      const url = process.env.REDIS_URL;
      let tcpClient = null;
      async function getTcpClient() {
        if (tcpClient && tcpClient.isReady) return tcpClient;
        tcpClient = createClient({ url });
        tcpClient.on('error', (err) => console.warn('[token-store] Redis TCP error:', err.message));
        await tcpClient.connect();
        return tcpClient;
      }
      storeInstance = {
        get: async (key) => {
          const client = await getTcpClient();
          return client.get(key);
        },
        set: async (key, value) => {
          const client = await getTcpClient();
          return client.set(key, value);
        },
        del: async (key) => {
          const client = await getTcpClient();
          return client.del(key);
        },
      };
      return storeInstance;
    } catch (err) {
      console.warn('[token-store] Redis TCP failed:', err.message);
    }
  }

  // Legacy Vercel KV (deprecated)
  if (isLegacyKVConfigured()) {
    try {
      const kv = require('@vercel/kv');
      storeInstance = {
        get: (key) => kv.get(key),
        set: (key, value) => kv.set(key, value),
        del: (key) => kv.del(key),
      };
      return storeInstance;
    } catch (err) {
      console.warn('[token-store] @vercel/kv not available:', err.message);
    }
  }

  storeInstance = false;
  return null;
}

/**
 * Get the Reddit refresh token
 * Priority: Redis/KV store > Environment variable
 * @returns {Promise<{token: string|null, source: string}>}
 */
async function getRefreshToken() {
  const store = getStore();
  if (store) {
    try {
      const token = await store.get(KV_KEY);
      if (token) {
        return { token, source: 'kv' };
      }
    } catch (err) {
      console.error('[token-store] Store read error:', err.message);
    }
  }

  const envToken = process.env.REDDIT_REFRESH_TOKEN;
  if (envToken) {
    return { token: envToken, source: 'env' };
  }

  return { token: null, source: 'none' };
}

/**
 * Save the Reddit refresh token to the configured store
 * @param {string} token - The refresh token to save
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function saveRefreshToken(token) {
  const store = getStore();
  if (!store) {
    return {
      success: false,
      error: 'No Redis store configured. Add Upstash Redis (or legacy Vercel KV) via Vercel Marketplace and link to this project.',
    };
  }

  try {
    await store.set(KV_KEY, token);
    await store.set(KV_UPDATED_KEY, new Date().toISOString());
    console.log('[token-store] Refresh token saved');
    return { success: true };
  } catch (err) {
    console.error('[token-store] Store write error:', err.message);
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
    const store = getStore();
    if (store) {
      try {
        updatedAt = await store.get(KV_UPDATED_KEY);
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
 * Delete the refresh token from the store
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function deleteRefreshToken() {
  const store = getStore();
  if (!store) {
    return { success: false, error: 'No Redis store configured' };
  }

  try {
    await store.del(KV_KEY);
    await store.del(KV_UPDATED_KEY);
    console.log('[token-store] Refresh token deleted');
    return { success: true };
  } catch (err) {
    console.error('[token-store] Store delete error:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Get the OpenRouter API key
 * Priority: Environment variable > Redis/KV store
 * @returns {Promise<{key: string|null, source: string}>}
 */
async function getOpenRouterKey() {
  // Check env var first
  const envKey = process.env.OPENROUTER_API_KEY;
  if (envKey) {
    return { key: envKey, source: 'env' };
  }

  // Fall back to KV store
  const store = getStore();
  if (store) {
    try {
      const key = await store.get(KV_OPENROUTER_KEY);
      if (key) {
        return { key, source: 'kv' };
      }
    } catch (err) {
      console.error('[token-store] Store read error (OpenRouter):', err.message);
    }
  }

  return { key: null, source: 'none' };
}

/**
 * Save the OpenRouter API key to the configured store
 * @param {string} key - The API key to save
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function saveOpenRouterKey(key) {
  const store = getStore();
  if (!store) {
    return {
      success: false,
      error: 'No Redis store configured. Add Upstash Redis via Vercel Marketplace.',
    };
  }

  try {
    await store.set(KV_OPENROUTER_KEY, key);
    await store.set(KV_OPENROUTER_UPDATED_KEY, new Date().toISOString());
    console.log('[token-store] OpenRouter API key saved');
    return { success: true };
  } catch (err) {
    console.error('[token-store] Store write error (OpenRouter):', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Get OpenRouter key metadata (for admin/debugging)
 * @returns {Promise<{hasKey: boolean, source: string, updatedAt?: string}>}
 */
async function getOpenRouterKeyInfo() {
  const { key, source } = await getOpenRouterKey();

  let updatedAt = null;
  if (source === 'kv') {
    const store = getStore();
    if (store) {
      try {
        updatedAt = await store.get(KV_OPENROUTER_UPDATED_KEY);
      } catch (err) {
        // ignore
      }
    }
  }

  return {
    hasKey: !!key,
    source,
    ...(updatedAt && { updatedAt }),
    ...(key && { keyPreview: `${key.slice(0, 8)}...${key.slice(-4)}` }),
  };
}

module.exports = {
  isKVConfigured,
  getRefreshToken,
  saveRefreshToken,
  getTokenInfo,
  deleteRefreshToken,
  getOpenRouterKey,
  saveOpenRouterKey,
  getOpenRouterKeyInfo,
};
