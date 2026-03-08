// Storage abstraction layer
// Uses Vercel KV in production, memory for local dev

class MemoryStorage {
  constructor() {
    this.store = new Map();
    
    // Cleanup expired entries every hour
    const cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [key, data] of this.store.entries()) {
        if (data.expiresAt && data.expiresAt < now) {
          this.store.delete(key);
        }
      }
    }, 60 * 60 * 1000);
    if (typeof cleanupTimer.unref === 'function') {
      cleanupTimer.unref();
    }
  }

  async get(key) {
    const data = this.store.get(key);
    if (!data) return null;
    
    if (data.expiresAt && data.expiresAt < Date.now()) {
      this.store.delete(key);
      return null;
    }
    
    return data.value;
  }

  async set(key, value, ttlSeconds = 24 * 60 * 60) {
    if (typeof ttlSeconds === 'object' && ttlSeconds !== null) {
      const options = ttlSeconds;
      const effectiveTtl = options.ttlSeconds ?? 24 * 60 * 60;
      const existing = await this.get(key);
      if (options.onlyIfAbsent && existing !== null) {
        return null;
      }
      const expiresAt = Date.now() + (effectiveTtl * 1000);
      this.store.set(key, { value, expiresAt });
      return 'OK';
    }

    const expiresAt = Date.now() + (ttlSeconds * 1000);
    this.store.set(key, { value, expiresAt });
    return 'OK';
  }

  async delete(key) {
    this.store.delete(key);
  }

  async compareAndSwap(key, expectedValue, nextValue, ttlSeconds = 24 * 60 * 60) {
    const current = await this.get(key);
    const expectedSerialized = expectedValue === undefined ? undefined : JSON.stringify(expectedValue);
    const currentSerialized = current === null ? JSON.stringify(null) : JSON.stringify(current);

    if (expectedSerialized !== undefined && expectedSerialized !== currentSerialized) {
      return { ok: false, current };
    }

    await this.set(key, nextValue, ttlSeconds);
    return { ok: true, current };
  }
}

module.exports = { MemoryStorage };
