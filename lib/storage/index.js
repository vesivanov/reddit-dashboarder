// Storage factory - auto-selects best available storage
const { MemoryStorage } = require('./memory');

function createStorage() {
  // Priority: Redis > Vercel KV > Memory
  
  // Try Redis first
  if (process.env.REDIS_URL) {
    try {
      const { RedisStorage } = require('./redis');
      console.log('[Storage] Using Redis');
      return new RedisStorage();
    } catch (error) {
      console.error('[Storage] Redis failed to load:', error.message);
      console.log('[Storage] Falling back...');
    }
  }
  
  // Try Vercel KV
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    try {
      const { KVStorage } = require('./kv');
      console.log('[Storage] Using Vercel KV');
      return new KVStorage();
    } catch (error) {
      console.error('[Storage] Vercel KV failed to load:', error.message);
      console.log('[Storage] Falling back to MemoryStorage');
    }
  }
  
  console.log('[Storage] Using MemoryStorage (no persistent storage configured)');
  return new MemoryStorage();
}

module.exports = createStorage();
