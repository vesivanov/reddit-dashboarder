# Reddit-Dashboarder: Option 1 → Option 2 Migration Plan

**Current:** Personal use (you + me)  
**Target:** Multi-tenant SaaS (paid API access)  
**Constraint:** Don't block lead gen with over-engineering

---

## Phase 1: Reliable Personal Use (This Week)

### Goal
Fix the cold-start data loss so your daily workflow is reliable.

### Changes Needed

#### 1. Add Vercel KV (Not Redis)
```bash
# You run this once
vercel storage add kv
# Auto-sets KV_REST_API_URL and KV_REST_API_TOKEN env vars
```

#### 2. Create Simple KV Wrapper
```javascript
// lib/storage/kv.js
const { createClient } = require('@vercel/kv');

const kv = createClient({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

// Simple key-value with optional TTL
async function get(key) {
  const data = await kv.get(key);
  return data ? JSON.parse(data) : null;
}

async function set(key, value, ttlSeconds = 24 * 60 * 60) {
  await kv.set(key, JSON.stringify(value), { ex: ttlSeconds });
}

async function del(key) {
  await kv.del(key);
}

module.exports = { get, set, del };
```

#### 3. Replace In-Memory Store
```javascript
// lib/api-handlers/sync.js
const storage = process.env.KV_REST_API_URL 
  ? require('../storage/kv') 
  : require('../storage/memory'); // Fallback for local dev

// Replace all syncStore.get/set/delete with storage.get/set/del
```

#### 4. Keep Auth Simple (For Now)
- `/api/sync/:token` — stays as-is (token in URL)
- `/api/v1/*` — optional, can skip for personal use
- **No API keys needed yet**

### Result
✅ Data persists across cold starts  
✅ 24h TTL still applies  
✅ Zero friction for your workflow  
✅ Free tier: 256MB, 3k req/day (plenty for personal use)

---

## Phase 2: Beta Users (Next Month)

### Goal
Let 2-3 trusted people use it, validate demand before building full auth.

### Changes

#### 1. Simple API Key System (Global Key)
```javascript
// middleware/api-key.js
function requireApiKey(req, res, next) {
  const provided = req.headers.authorization?.replace('Bearer ', '');
  const expected = process.env.BETA_API_KEY; // Single key for all beta users
  
  if (provided !== expected) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  next();
}
```

#### 2. Move Token to Header (Optional)
Keep URL token for backward compatibility, add header support:
```javascript
const token = req.headers['x-sync-token'] || req.query.token;
```

#### 3. Add Basic Rate Limiting
```javascript
// Vercel Edge Config or simple in-memory
const rateLimit = new Map(); // userKey -> { count, resetTime }
```

### Result
✅ Can share with beta testers  
✅ One shared key (easy to rotate if leaked)  
✅ Can gauge interest before building full auth  

---

## Phase 3: Monetization (When Ready)

### Goal
Proper multi-tenant SaaS with per-user API keys, billing, etc.

### Changes

#### 1. User Accounts + Per-User Keys
- Database table: `users` (id, email, created_at)
- Database table: `api_keys` (id, user_id, key_hash, name, created_at, last_used_at)

#### 2. Scoped Storage
```javascript
// Keys prefixed by user
const userKey = `user:${userId}:sync:${syncToken}`;
```

#### 3. Stripe Integration
- Paywall on `/api/v1/*` endpoints
- Usage tracking (requests per month)
- Tiers: Free (100 req/day), Pro ($20/mo, 10k req/day)

#### 4. Proper Security
- API keys in database (bcrypt hashes)
- Request signing (optional)
- Audit logs

---

## The Bridge: Designing for Phase 3 While Building Phase 1

### Abstractions to Add Now (Cheap, Future-Proofing)

```javascript
// lib/storage/index.js
// Abstracts KV vs future PostgreSQL
class Storage {
  async get(key) { }
  async set(key, value, ttl) { }
  async delete(key) { }
}

module.exports = process.env.KV_REST_API_URL 
  ? new KVStorage() 
  : new MemoryStorage();
```

```javascript
// lib/auth/index.js
// Abstracts "no auth" → "simple key" → "per-user keys"
class Auth {
  async verify(req) {
    // Phase 1: Always allow
    // Phase 2: Check global BETA_API_KEY
    // Phase 3: Check per-user key against database
    return { userId: null, allowed: true };
  }
}
```

### What NOT to Do Now
❌ Database (overkill for personal use)  
❌ Per-user keys (too much friction)  
❌ Stripe (no revenue yet)  
❌ Complex auth flows (blocks your lead gen)  

---

## Recommended Next Steps

### Immediate (Today)
1. Merge the current PR (#38)
2. Add Vercel KV to your project: `vercel storage add kv`
3. Update `lib/api-handlers/sync.js` to use KV
4. Deploy

### This Week
1. Test the full flow: You sync → I analyze → You get leads
2. Fix any remaining issues
3. Document the API for yourself (personal API docs)

### Next Month (If Leads Are Flowing)
1. Decide: Is this worth productizing?
2. If yes: Add simple global API key, invite 2-3 beta users
3. If no: Keep as internal tool, focus on consulting

---

## Key Insight

The **biggest risk** isn't technical debt — it's **building the wrong thing**. 

If we over-engineer Phase 3 before you have paying customers asking for it, we waste time you could spend finding clients.

Better flow:
1. **You** use it daily → find bugs, validate value
2. **I** use it to help you → validate the AI analysis is useful
3. **Others ask** "can I use this?" → now we build Phase 2
4. **They pay** → now we build Phase 3

This keeps you focused on **income ASAP** (your #1 priority) while keeping the door open to productization later.

---

Want me to implement Phase 1 (Vercel KV migration) now? Should take ~30 min.
