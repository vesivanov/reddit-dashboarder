const memoryStore = new Map();
const expiringValueStore = new Map();

let redisClient = null;
let redisConnectPromise = null;

function cleanupMemoryStore() {
  const now = Date.now();
  for (const [key, record] of memoryStore.entries()) {
    if (!record || record.resetAt <= now) {
      memoryStore.delete(key);
    }
  }
  for (const [key, record] of expiringValueStore.entries()) {
    if (!record || record.expiresAt <= now) {
      expiringValueStore.delete(key);
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

async function setRedisExpiringValue(key, value, ttlMs) {
  const client = await getRedisClient();
  if (!client) return false;

  await client.set(key, JSON.stringify(value), {
    PX: ttlMs,
  });
  return true;
}

function setMemoryExpiringValue(key, value, ttlMs) {
  expiringValueStore.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
}

async function setExpiringValue(key, value, ttlMs) {
  const ttl = Math.max(1, Number(ttlMs) || 0);
  if (ttl <= 0) return;

  const wroteToRedis = await setRedisExpiringValue(key, value, ttl).catch((error) => {
    console.warn('[rate-limit-store] Redis set failed, using memory:', error.message);
    return false;
  });
  if (!wroteToRedis) {
    setMemoryExpiringValue(key, value, ttl);
  }
}

async function getRedisExpiringValue(key) {
  const client = await getRedisClient();
  if (!client) return null;

  const [rawValue, ttlMs] = await Promise.all([
    client.get(key),
    client.pTTL(key),
  ]);
  if (!rawValue) return null;

  return {
    value: JSON.parse(rawValue),
    ttlMs: Math.max(0, Number(ttlMs) || 0),
  };
}

function getMemoryExpiringValue(key) {
  const record = expiringValueStore.get(key);
  if (!record) return null;
  if (record.expiresAt <= Date.now()) {
    expiringValueStore.delete(key);
    return null;
  }
  return {
    value: record.value,
    ttlMs: Math.max(0, record.expiresAt - Date.now()),
  };
}

async function getExpiringValue(key) {
  const redisRecord = await getRedisExpiringValue(key).catch((error) => {
    console.warn('[rate-limit-store] Redis get failed, using memory:', error.message);
    return null;
  });
  if (redisRecord) return redisRecord;
  return getMemoryExpiringValue(key);
}

async function clearExpiringValue(key) {
  expiringValueStore.delete(key);
  const client = await getRedisClient().catch(() => null);
  if (client) {
    await client.del(key).catch(() => {});
  }
}

module.exports = {
  incrementWindow,
  setExpiringValue,
  getExpiringValue,
  clearExpiringValue,
};
