// Redis storage implementation using REDIS_URL
// Works with Upstash Redis, Redis Cloud, etc.

const redis = require('redis');

class RedisStorage {
  constructor() {
    if (!process.env.REDIS_URL) {
      throw new Error('REDIS_URL not configured');
    }
    
    this.url = process.env.REDIS_URL;
    this.client = null;
  }

  async connect() {
    if (!this.client) {
      this.client = redis.createClient({
        url: this.url,
      });
      
      this.client.on('error', (err) => {
        console.error('[RedisStorage] Error:', err.message);
      });
      
      await this.client.connect();
    }
    return this.client;
  }

  async get(key) {
    try {
      const client = await this.connect();
      const data = await client.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('[RedisStorage] get error:', error.message);
      return null;
    }
  }

  async set(key, value, ttlSeconds = 24 * 60 * 60) {
    try {
      const client = await this.connect();
      const serialized = JSON.stringify(value);
      await client.setEx(key, ttlSeconds, serialized);
    } catch (error) {
      console.error('[RedisStorage] set error:', error.message);
      throw error;
    }
  }

  async delete(key) {
    try {
      const client = await this.connect();
      await client.del(key);
    } catch (error) {
      console.error('[RedisStorage] delete error:', error.message);
    }
  }
}

module.exports = { RedisStorage };
