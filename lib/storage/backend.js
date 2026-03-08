let rawStoreInstance = null;

function isUpstashConfigured() {
  return !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

function isRedisRestConfigured() {
  const url = process.env.REDIS_URL;
  if (!url || typeof url !== 'string' || !url.startsWith('https://')) return false;
  return !!(resolveRedisRestConfig(url).token);
}

function isRedisTcpConfigured() {
  const url = process.env.REDIS_URL;
  return !!(url && typeof url === 'string' && url.startsWith('redis://'));
}

function isLegacyKVConfigured() {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

function hasPersistentStoreConfigured() {
  return (
    isUpstashConfigured() ||
    isRedisRestConfigured() ||
    isRedisTcpConfigured() ||
    isLegacyKVConfigured()
  );
}

function resolveRedisRestConfig(rawUrl) {
  let url = rawUrl;
  let token = process.env.REDIS_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || null;

  if (!token && url && url.includes('@')) {
    try {
      const parsed = new URL(url);
      if (parsed.username && parsed.password) {
        token = parsed.password;
        url = `${parsed.protocol}//${parsed.host}`;
      }
    } catch (_error) {
      // Ignore invalid URLs and let the caller fall through.
    }
  }

  return { url, token };
}

function createStoreAdapter(kind, methods) {
  return {
    kind,
    get: methods.get,
    set: methods.set,
    del: methods.del,
  };
}

function getRawStore() {
  if (rawStoreInstance !== null) {
    return rawStoreInstance;
  }

  if (isUpstashConfigured()) {
    try {
      const { Redis } = require('@upstash/redis');
      const redis = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      });
      rawStoreInstance = createStoreAdapter('upstash', {
        get: (key) => redis.get(key),
        set: (key, value, options = {}) => {
          const writeOptions = {};
          if (options.ttlSeconds) {
            writeOptions.ex = options.ttlSeconds;
          }
          if (options.onlyIfAbsent) {
            writeOptions.nx = true;
          }
          return redis.set(key, value, writeOptions);
        },
        del: (key) => redis.del(key),
      });
      return rawStoreInstance;
    } catch (error) {
      console.warn('[storage-backend] Upstash Redis failed:', error.message);
    }
  }

  if (isRedisRestConfigured()) {
    const { url, token } = resolveRedisRestConfig(process.env.REDIS_URL);
    if (url && token) {
      try {
        const { Redis } = require('@upstash/redis');
        const redis = new Redis({ url, token });
        rawStoreInstance = createStoreAdapter('redis-rest', {
          get: (key) => redis.get(key),
          set: (key, value, options = {}) => {
            const writeOptions = {};
            if (options.ttlSeconds) {
              writeOptions.ex = options.ttlSeconds;
            }
            if (options.onlyIfAbsent) {
              writeOptions.nx = true;
            }
            return redis.set(key, value, writeOptions);
          },
          del: (key) => redis.del(key),
        });
        return rawStoreInstance;
      } catch (error) {
        console.warn('[storage-backend] Redis REST failed:', error.message);
      }
    }
  }

  if (isRedisTcpConfigured()) {
    try {
      const { createClient } = require('redis');
      const url = process.env.REDIS_URL;
      let client = null;
      let connectPromise = null;

      async function getClient() {
        if (client && client.isReady) {
          return client;
        }
        if (connectPromise) {
          return connectPromise;
        }

        client = createClient({ url });
        client.on('error', (error) => {
          console.warn('[storage-backend] Redis TCP error:', error.message);
        });
        connectPromise = client.connect().then(() => client).finally(() => {
          connectPromise = null;
        });
        return connectPromise;
      }

      rawStoreInstance = createStoreAdapter('redis-tcp', {
        get: async (key) => {
          const readyClient = await getClient();
          return readyClient.get(key);
        },
        set: async (key, value, options = {}) => {
          const readyClient = await getClient();
          const writeOptions = {};
          if (options.ttlSeconds) {
            writeOptions.EX = options.ttlSeconds;
          }
          if (options.onlyIfAbsent) {
            writeOptions.NX = true;
          }
          return readyClient.set(key, value, writeOptions);
        },
        del: async (key) => {
          const readyClient = await getClient();
          return readyClient.del(key);
        },
      });
      return rawStoreInstance;
    } catch (error) {
      console.warn('[storage-backend] Redis TCP failed:', error.message);
    }
  }

  if (isLegacyKVConfigured()) {
    try {
      const kv = require('@vercel/kv');
      rawStoreInstance = createStoreAdapter('vercel-kv', {
        get: (key) => kv.get(key),
        set: (key, value, options = {}) => {
          const writeOptions = {};
          if (options.ttlSeconds) {
            writeOptions.ex = options.ttlSeconds;
          }
          if (options.onlyIfAbsent) {
            writeOptions.nx = true;
          }
          return kv.set(key, value, writeOptions);
        },
        del: (key) => kv.del(key),
      });
      return rawStoreInstance;
    } catch (error) {
      console.warn('[storage-backend] Vercel KV failed:', error.message);
    }
  }

  rawStoreInstance = false;
  return null;
}

function resetRawStoreForTests() {
  rawStoreInstance = null;
}

module.exports = {
  getRawStore,
  hasPersistentStoreConfigured,
  resetRawStoreForTests,
};
