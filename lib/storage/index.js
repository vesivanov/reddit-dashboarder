// Storage factory - auto-selects best available storage
const { MemoryStorage } = require('./memory');
const { KVStorage } = require('./kv');
const { RedisStorage } = require('./redis');

function createStorage() {
  // Priority: Redis > Vercel KV > Memory
  if (process.env.REDIS_URL) {
    console.log('[Storage] Using Redis');
    return new RedisStorage();
  }
  
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    console.log('[Storage] Using Vercel KV');
    return new KVStorage();
  }
  
  console.log('[Storage] Using MemoryStorage (local dev fallback)');
  return new MemoryStorage();
}

module.exports = createStorage();
