// Storage factory - uses shared persistent backend selection with memory fallback
const { MemoryStorage } = require('./memory');
const { getRawStore } = require('./backend');

class PersistentStorage {
  constructor(rawStore) {
    this.rawStore = rawStore;
    this.kind = rawStore?.kind || 'persistent';
    this.persistent = true;
  }

  async get(key) {
    try {
      const data = await this.rawStore.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('[Storage] get error:', error.message);
      return null;
    }
  }

  async set(key, value, ttlSeconds = 24 * 60 * 60) {
    try {
      await this.rawStore.set(key, JSON.stringify(value), { ttlSeconds });
    } catch (error) {
      console.error('[Storage] set error:', error.message);
      throw error;
    }
  }

  async delete(key) {
    try {
      await this.rawStore.del(key);
    } catch (error) {
      console.error('[Storage] delete error:', error.message);
    }
  }

  async compareAndSwap(key, expectedValue, nextValue, ttlSeconds = 24 * 60 * 60, options = {}) {
    const lockKey = `__lock__:${key}`;
    const lockToken = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const lockTtlSeconds = options.lockTtlSeconds || 5;
    const retries = options.retries || 10;

    for (let attempt = 0; attempt < retries; attempt += 1) {
      const locked = await this.rawStore.set(lockKey, lockToken, {
        ttlSeconds: lockTtlSeconds,
        onlyIfAbsent: true,
      });

      if (!locked) {
        await new Promise((resolve) => setTimeout(resolve, 10));
        continue;
      }

      try {
        const current = await this.get(key);
        const expectedSerialized = expectedValue === undefined ? undefined : JSON.stringify(expectedValue);
        const currentSerialized = current === null ? JSON.stringify(null) : JSON.stringify(current);

        if (expectedSerialized !== undefined && expectedSerialized !== currentSerialized) {
          return { ok: false, current };
        }

        await this.set(key, nextValue, ttlSeconds);
        return { ok: true, current };
      } finally {
        try {
          const storedLockValue = await this.rawStore.get(lockKey);
          if (storedLockValue === lockToken) {
            await this.rawStore.del(lockKey);
          }
        } catch (_error) {
          // Ignore lock cleanup failures.
        }
      }
    }

    throw new Error(`CAS_LOCK_TIMEOUT:${key}`);
  }
}

function createStorage() {
  const rawStore = getRawStore();
  if (rawStore) {
    console.log(`[Storage] Using persistent backend: ${rawStore.kind}`);
    return new PersistentStorage(rawStore);
  }

  console.log('[Storage] Using MemoryStorage (no persistent storage configured)');
  const memory = new MemoryStorage();
  memory.kind = 'memory';
  memory.persistent = false;
  return memory;
}

module.exports = createStorage();
