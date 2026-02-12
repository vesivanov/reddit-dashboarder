// Storage factory - auto-selects KV or Memory based on env
const { MemoryStorage } = require('./memory');
const { KVStorage } = require('./kv');

function createStorage() {
  // Use Vercel KV if configured, otherwise fallback to memory
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    console.log('[Storage] Using Vercel KV');
    return new KVStorage();
  }
  
  console.log('[Storage] Using MemoryStorage (local dev fallback)');
  return new MemoryStorage();
}

module.exports = createStorage();
