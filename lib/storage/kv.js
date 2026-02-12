// Vercel KV storage implementation
// Requires KV_REST_API_URL and KV_REST_API_TOKEN env vars

class KVStorage {
  constructor() {
    if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
      throw new Error('Vercel KV not configured. Run: vercel storage add kv');
    }
    
    // Lazy-load @vercel/kv to prevent crash when not configured
    const { createClient } = require('@vercel/kv');
    this.client = createClient({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
    });
  }

  async get(key) {
    try {
      const data = await this.client.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('[KVStorage] get error:', error.message);
      return null;
    }
  }

  async set(key, value, ttlSeconds = 24 * 60 * 60) {
    try {
      const serialized = JSON.stringify(value);
      await this.client.set(key, serialized, { ex: ttlSeconds });
    } catch (error) {
      console.error('[KVStorage] set error:', error.message);
      throw error;
    }
  }

  async delete(key) {
    try {
      await this.client.del(key);
    } catch (error) {
      console.error('[KVStorage] delete error:', error.message);
    }
  }
}

module.exports = { KVStorage };
