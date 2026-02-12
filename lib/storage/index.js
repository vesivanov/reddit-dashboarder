// Storage factory - auto-selects best available storage
const { MemoryStorage } = require('./memory');

function createStorage() {
  // Priority: Vercel KV > Memory (Redis disabled for now - connection issues)
  // TODO: Fix Redis connection timeout issues on Vercel
  
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    try {
      const { KVStorage } = require('./kv');
      console.log('[Storage] Using Vercel KV');
      return new KVStorage();
    } catch (error) {
      console.error('[Storage] Vercel KV failed to load:', error.message);
      console.log('[Storage] Falling back to MemoryStorage');
      return new MemoryStorage();
    }
  }
  
  console.log('[Storage] Using MemoryStorage');
  return new MemoryStorage();
}

module.exports = createStorage();
