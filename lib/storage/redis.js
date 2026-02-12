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
    this.connectionPromise = null;
  }

  async connect() {
    if (this.client?.isReady) {
      return this.client;
    }
    
    // Prevent multiple concurrent connection attempts
    if (this.connectionPromise) {
      return this.connectionPromise;
    }
    
    this.connectionPromise = (async () => {
      try {
        this.client = redis.createClient({
          url: this.url,
          socket: {
            connectTimeout: 5000, // 5 second timeout
            reconnectStrategy: (retries) => {
              if (retries > 3) {
                console.error('[RedisStorage] Max retries exceeded');
                return new Error('Max retries');
              }
              return Math.min(retries * 100, 3000);
            }
          }
        });
        
        this.client.on('error', (err) => {
          console.error('[RedisStorage] Error:', err.message);
        });
        
        await this.client.connect();
        console.log('[RedisStorage] Connected');
        return this.client;
      } catch (error) {
        console.error('[RedisStorage] Connection failed:', error.message);
        this.client = null;
        throw error;
      } finally {
        this.connectionPromise = null;
      }
    })();
    
    return this.connectionPromise;
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
