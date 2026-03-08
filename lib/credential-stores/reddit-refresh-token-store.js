const { getRawStore, hasPersistentStoreConfigured } = require('../storage/backend');

const STORE_KEY = 'reddit_refresh_token';
const STORE_UPDATED_KEY = 'reddit_refresh_token_updated';

function isPersistentStoreConfigured() {
  return hasPersistentStoreConfigured();
}

async function getRefreshToken() {
  const store = getRawStore();
  if (store) {
    try {
      const token = await store.get(STORE_KEY);
      if (token) {
        return { token, source: 'persistent-store' };
      }
    } catch (err) {
      console.error('[reddit-refresh-token-store] Store read error:', err.message);
    }
  }

  const envToken = process.env.REDDIT_REFRESH_TOKEN;
  if (envToken) {
    return { token: envToken, source: 'env' };
  }

  return { token: null, source: 'none' };
}

async function saveRefreshToken(token) {
  const store = getRawStore();
  if (!store) {
    return {
      success: false,
      error: 'No persistent store configured. Add Redis, Upstash, or legacy Vercel KV for durable token storage.',
    };
  }

  try {
    await store.set(STORE_KEY, token);
    await store.set(STORE_UPDATED_KEY, new Date().toISOString());
    console.log('[reddit-refresh-token-store] Refresh token saved');
    return { success: true };
  } catch (err) {
    console.error('[reddit-refresh-token-store] Store write error:', err.message);
    return { success: false, error: err.message };
  }
}

async function getTokenInfo() {
  const { token, source } = await getRefreshToken();

  let updatedAt = null;
  if (source === 'persistent-store') {
    const store = getRawStore();
    if (store) {
      try {
        updatedAt = await store.get(STORE_UPDATED_KEY);
      } catch (_err) {
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

async function deleteRefreshToken() {
  const store = getRawStore();
  if (!store) {
    return { success: false, error: 'No persistent store configured' };
  }

  try {
    await store.del(STORE_KEY);
    await store.del(STORE_UPDATED_KEY);
    console.log('[reddit-refresh-token-store] Refresh token deleted');
    return { success: true };
  } catch (err) {
    console.error('[reddit-refresh-token-store] Store delete error:', err.message);
    return { success: false, error: err.message };
  }
}

module.exports = {
  isPersistentStoreConfigured,
  getRefreshToken,
  saveRefreshToken,
  getTokenInfo,
  deleteRefreshToken,
};
