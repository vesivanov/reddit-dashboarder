const memoryStore = new Map();

let redisClient = null;
let redisConnectPromise = null;

function cleanupMemoryStore() {
  const now = Date.now();
  for (const [key, record] of memoryStore.entries()) {
    if (!record || record.resetAt <= now) {
      memoryStore.delete(key);
    }
  }
}

const cleanupTimer = setInterval(cleanupMemoryStore, 60 * 1000);
if (typeof cleanupTimer.unref === 'function') {
  cleanupTimer.unref();
}

function canUseRedis() {
  return Boolean(process.env.REDIS_URL);
}

async function getRedisClient() {
  if (!canUseRedis()) return null;
  if (redisClient?.isReady) return redisClient;
  if (redisConnectPromise) return redisConnectPromise;

  redisConnectPromise = (async () => {
    try {
      const { createClient } = require('redis');
      const client = createClient({ url: process.env.REDIS_URL });
      client.on('error', (err) => {
        console.warn('[rate-limit-store] Redis error:', err.message);
      });
      await client.connect();
      redisClient = client;
      return client;
    } catch (error) {
      console.warn('[rate-limit-store] Falling back to memory:', error.message);
      redisClient = null;
      return null;
    } finally {
      redisConnectPromise = null;
    }
  })();

  return redisConnectPromise;
}

async function incrementRedisWindow(key, windowMs) {
  const client = await getRedisClient();
  if (!client) return null;

  const script = `
    local current = redis.call('INCR', KEYS[1])
    if current == 1 then
      redis.call('PEXPIRE', KEYS[1], ARGV[1])
    end
    local ttl = redis.call('PTTL', KEYS[1])
    return {current, ttl}
  `;

  const result = await client.eval(script, {
    keys: [key],
    arguments: [String(windowMs)],
  });

  const count = Number(Array.isArray(result) ? result[0] : 0);
  const ttlMs = Math.max(0, Number(Array.isArray(result) ? result[1] : 0));
  return {
    count,
    resetAt: Date.now() + ttlMs,
  };
}

function incrementMemoryWindow(key, windowMs) {
  const now = Date.now();
  const existing = memoryStore.get(key);

  if (!existing || now > existing.resetAt) {
    const record = {
      count: 1,
      resetAt: now + windowMs,
    };
    memoryStore.set(key, record);
    return record;
  }

  existing.count += 1;
  memoryStore.set(key, existing);
  return existing;
}

async function incrementWindow(key, windowMs) {
  const redisRecord = await incrementRedisWindow(key, windowMs).catch((error) => {
    console.warn('[rate-limit-store] Redis increment failed, using memory:', error.message);
    return null;
  });
  if (redisRecord) return redisRecord;
  return incrementMemoryWindow(key, windowMs);
}

module.exports = {
  incrementWindow,
};
