// Storage abstraction layer
// Uses Vercel KV in production, memory for local dev

class MemoryStorage {
  constructor() {
    this.store = new Map();
    
    // Cleanup expired entries every hour
    setInterval(() => {
      const now = Date.now();
      for (const [key, data] of this.store.entries()) {
        if (data.expiresAt && data.expiresAt < now) {
          this.store.delete(key);
        }
      }
    }, 60 * 60 * 1000);
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
    const expiresAt = Date.now() + (ttlSeconds * 1000);
    this.store.set(key, { value, expiresAt });
  }

  async delete(key) {
    this.store.delete(key);
  }
}

module.exports = { MemoryStorage };
