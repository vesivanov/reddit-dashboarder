const { getRawStore } = require('../storage/backend');

const STORE_OPENROUTER_KEY = 'openrouter_api_key';
const STORE_OPENROUTER_UPDATED_KEY = 'openrouter_api_key_updated';

async function getOpenRouterKey() {
  const envKey = process.env.OPENROUTER_API_KEY;
  if (envKey) {
    return { key: envKey, source: 'env' };
  }

  const store = getRawStore();
  if (store) {
    try {
      const key = await store.get(STORE_OPENROUTER_KEY);
      if (key) {
        return { key, source: 'persistent-store' };
      }
    } catch (err) {
      console.error('[openrouter-key-store] Store read error:', err.message);
    }
  }

  return { key: null, source: 'none' };
}

async function saveOpenRouterKey(key) {
  const store = getRawStore();
  if (!store) {
    return {
      success: false,
      error: 'No Redis store configured. Add Upstash Redis via Vercel Marketplace.',
    };
  }

  try {
    await store.set(STORE_OPENROUTER_KEY, key);
    await store.set(STORE_OPENROUTER_UPDATED_KEY, new Date().toISOString());
    console.log('[openrouter-key-store] OpenRouter API key saved');
    return { success: true };
  } catch (err) {
    console.error('[openrouter-key-store] Store write error:', err.message);
    return { success: false, error: err.message };
  }
}

async function getOpenRouterKeyInfo() {
  const { key, source } = await getOpenRouterKey();

  let updatedAt = null;
  if (source === 'persistent-store') {
    const store = getRawStore();
    if (store) {
      try {
        updatedAt = await store.get(STORE_OPENROUTER_UPDATED_KEY);
      } catch (_err) {
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

async function deleteOpenRouterKey() {
  const store = getRawStore();
  if (!store) {
    return { success: false, error: 'No Redis store configured' };
  }

  try {
    await store.del(STORE_OPENROUTER_KEY);
    await store.del(STORE_OPENROUTER_UPDATED_KEY);
    console.log('[openrouter-key-store] OpenRouter API key deleted');
    return { success: true };
  } catch (err) {
    console.error('[openrouter-key-store] Store delete error:', err.message);
    return { success: false, error: err.message };
  }
}

module.exports = {
  getOpenRouterKey,
  saveOpenRouterKey,
  getOpenRouterKeyInfo,
  deleteOpenRouterKey,
};
