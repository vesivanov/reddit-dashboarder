// Storage factory - auto-selects best available storage
const { MemoryStorage } = require('./memory');
const { KVStorage } = require('./kv');

function createStorage() {
  // Priority: Redis > Vercel KV > Memory
  if (process.env.REDIS_URL) {
    try {
      const { RedisStorage } = require('./redis');
      console.log('[Storage] Using Redis');
      return new RedisStorage();
    } catch (error) {
      console.error('[Storage] Redis failed to load:', error.message);
      console.log('[Storage] Falling back to MemoryStorage');
      return new MemoryStorage();
    }
  }
  
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    console.log('[Storage] Using Vercel KV');
    return new KVStorage();
  }
  
  console.log('[Storage] Using MemoryStorage (local dev fallback)');
  return new MemoryStorage();
}

module.exports = createStorage();
