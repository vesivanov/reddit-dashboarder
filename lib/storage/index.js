// Storage factory - auto-selects best available storage
const { MemoryStorage } = require('./memory');
const { KVStorage } = require('./kv');

function createStorage() {
  // Priority: Vercel KV > Memory (Redis disabled for now - connection issues)
  // TODO: Fix Redis connection timeout issues on Vercel
  
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    console.log('[Storage] Using Vercel KV');
    return new KVStorage();
  }
  
  console.log('[Storage] Using MemoryStorage');
  return new MemoryStorage();
}

module.exports = createStorage();
