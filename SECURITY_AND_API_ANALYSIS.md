# Security & API Analysis — Reddit Dashboarder

## 🔴 Critical Security Issues

### 1. Public API Endpoints (No Authentication)

**Problem:** Most API endpoints are publicly exposed without authentication.

| Endpoint | Current State | Risk Level | Impact |
|----------|--------------|------------|---------|
| `/api/reddit` | Public | 🔴 **HIGH** | Anyone can hit Reddit API through your app → rate limit exhaustion |
| `/api/reddit/ai-rank` | Public | 🔴 **HIGH** | Free AI ranking for anyone → OpenRouter API cost abuse |
| `/api/reddit/digest` | Public (has weak auth) | 🟡 **MEDIUM** | Requires header, but still discoverable |
| `/api/v1/*` | Public | 🔴 **HIGH** | Productized API with no gating |
| `/api/sync/:token` | Public | 🟡 **MEDIUM** | Anyone with token can read/write user data |
| `/api/settings/server/openrouter-key` | Public | 🔴 **CRITICAL** | Could expose server API key |

---

## 🛡️ Recommended Security Fixes

### Priority 1: Immediate (Pre-Launch)

#### 1.1 Rate Limiting
Add rate limiting to all public endpoints:

```javascript
// lib/middleware/rate-limit.js
const rateLimit = require('express-rate-limit');

const createLimiter = (windowMs, max, message) => rateLimit({
  windowMs,
  max,
  message: { error: message },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  // Strict for expensive endpoints
  aiRankLimiter: createLimiter(
    15 * 60 * 1000, // 15 minutes
    10, // 10 requests per 15 min
    'Too many AI ranking requests. Try again in 15 minutes.'
  ),
  
  // Medium for Reddit API
  redditLimiter: createLimiter(
    5 * 60 * 1000, // 5 minutes
    30, // 30 requests per 5 min
    'Too many Reddit API requests. Try again in a few minutes.'
  ),
  
  // Loose for read-only
  generalLimiter: createLimiter(
    1 * 60 * 1000, // 1 minute
    60, // 60 requests per minute
    'Too many requests. Please slow down.'
  ),
};
```

**Apply in app.js:**
```javascript
const { aiRankLimiter, redditLimiter, generalLimiter } = require('./lib/middleware/rate-limit');

app.post('/api/reddit/ai-rank', aiRankLimiter, aiRankHandler);
app.get('/api/reddit', redditLimiter, redditHandler);
app.get('/api/reddit/digest', aiRankLimiter, digestHandler);
```

#### 1.2 API Key Authentication for Power Users

Create a simple API key system for `/api/v1/*` endpoints:

```javascript
// lib/middleware/api-key-auth.js
function requireApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.query.api_key;
  
  if (!apiKey) {
    return res.status(401).json({
      error: 'API key required',
      message: 'Include X-API-Key header or ?api_key=YOUR_KEY'
    });
  }
  
  // For now, check against env var (later: database lookup)
  const validKeys = (process.env.API_KEYS || '').split(',').filter(Boolean);
  
  if (!validKeys.includes(apiKey)) {
    return res.status(403).json({
      error: 'Invalid API key',
      message: 'Contact support for API access'
    });
  }
  
  next();
}

module.exports = { requireApiKey };
```

**Apply to v1 endpoints:**
```javascript
const { requireApiKey } = require('./lib/middleware/api-key-auth');

app.get('/api/v1/snapshot', requireApiKey, v1SnapshotHandler);
app.get('/api/v1/config', requireApiKey, v1ConfigHandler);
app.patch('/api/v1/config', requireApiKey, v1ConfigHandler);
```

#### 1.3 Secure Cron Endpoint (Already Done ✅)

`/api/cron/refresh-leads` already requires `X-Cron-Secret` header. Good!

---

### Priority 2: Pre-Monetization

#### 2.1 User Authentication & Tiers

When adding paid tiers, implement proper user auth:

**Free tier limits:**
- 10 AI rankings per day
- 3 subreddits max
- No digest API access

**Pro tier ($29/mo):**
- Unlimited AI rankings
- Unlimited subreddits
- Digest API access with personal API key

**Implementation:**
```javascript
// lib/middleware/auth.js
function requireAuth(req, res, next) {
  const token = req.cookies.rdd_session; // or Authorization header
  
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  // Verify token, attach user to req
  const user = verifyToken(token); // Your auth logic
  if (!user) {
    return res.status(401).json({ error: 'Invalid session' });
  }
  
  req.user = user;
  next();
}

function requirePro(req, res, next) {
  if (!req.user || req.user.tier !== 'pro') {
    return res.status(403).json({
      error: 'Pro subscription required',
      message: 'Upgrade to access this feature',
      upgradeUrl: '/pricing'
    });
  }
  next();
}
```

#### 2.2 Usage Tracking

Track API usage per user for billing and abuse prevention:

```javascript
// lib/middleware/usage-tracking.js
async function trackUsage(req, res, next) {
  const endpoint = req.path;
  const userId = req.user?.id || 'anonymous';
  
  // Increment counter in Redis
  await storage.increment(`usage:${userId}:${endpoint}:${today}`);
  
  next();
}
```

---

## 🎯 Current API Inventory

### Public Endpoints (Should Stay Public)
✅ **Keep these open:**
- `/api/health` - Health check
- `/api/auth/*` - OAuth flow (needs to be public)
- `/api/root-info` - App metadata

### Endpoints That Need Protection

#### HIGH PRIORITY (Costly/Abusable)
🔴 `/api/reddit/ai-rank` → Add rate limiting + optional API key  
🔴 `/api/reddit` → Add rate limiting  
🔴 `/api/reddit/digest` → Keep current auth, add rate limiting  
🔴 `/api/v1/*` → Require API key  

#### MEDIUM PRIORITY (Data Access)
🟡 `/api/sync/:token` → Add rate limiting + token validation  
🟡 `/api/settings/server/*` → Require admin auth or remove  
🟡 `/api/openrouter/models` → Rate limit (prevents scraping model list)  

#### LOW PRIORITY (Read-Only, Low Risk)
🟢 `/api/v1/leads/latest` → Currently public, could add optional auth for stats

---

## 🚀 UI Analysis & Missing Features

### Current UI Strengths
✅ Three-pane layout (subreddits, posts, detail)  
✅ AI ranking with OpenRouter  
✅ Dark mode  
✅ Auto-refresh  
✅ Velocity signals  
✅ Settings import/export  

### Missing UI Features

#### 1. Landing Page / Marketing
❌ No landing page - SPA goes straight to dashboard  
❌ No pricing page  
❌ No documentation link in UI  
❌ No "Upgrade to Pro" messaging  

#### 2. Onboarding Experience
❌ No guided tour for first-time users  
❌ No starter pack suggestions on empty state  
❌ No example goals/contexts for AI ranking  

#### 3. Pro Features Indicators
❌ No "Pro" badges on paid features  
❌ No usage limits shown (e.g., "8/10 AI rankings used today")  
❌ No upgrade prompts when hitting limits  

#### 4. Lead Management
❌ No way to mark leads as "contacted" or "ignored"  
❌ No saved/starred posts  
❌ No export to CSV/CRM  
❌ No email digest scheduling UI  

#### 5. Collaboration Features (Future)
❌ No team workspace  
❌ No shared filters/settings  
❌ No commenting on posts  

---

## 📋 Recommended Implementation Order

### Phase 1: Security (This Week)
1. ✅ Add `express-rate-limit` package
2. ✅ Implement rate limiting middleware
3. ✅ Apply to all public endpoints
4. ✅ Deploy and test

### Phase 2: Landing & Marketing (Next 3 Days)
1. Build landing page (`/`)
2. Build pricing page (`/pricing`)
3. Build docs site (`/docs`)
4. Add "Upgrade" CTA in dashboard
5. Add usage tracking hooks (prep for Pro tier)

### Phase 3: Pro Tier (Next 2 Weeks)
1. Stripe integration
2. User accounts (email/password or OAuth)
3. Tier enforcement (Free vs Pro)
4. Usage limit UI
5. Upgrade flow

### Phase 4: Lead Management (Future)
1. Save/star posts
2. Export to CSV
3. CRM integrations (Zapier/Make)
4. Email digest scheduling

---

## 🔒 Immediate Action Items

**Before any public launch:**

1. **Install rate limiting:**
   ```bash
   npm install express-rate-limit
   ```

2. **Create `lib/middleware/rate-limit.js`** (code above)

3. **Update `app.js`** to apply limiters

4. **Deploy ASAP**

5. **Monitor Vercel logs** for abuse patterns

---

## 📊 API Usage Recommendations

**For free users:**
- `/api/reddit`: 30 requests per 5 min
- `/api/reddit/ai-rank`: 10 requests per 15 min
- `/api/sync`: 20 requests per minute

**For Pro users (with API key):**
- `/api/reddit`: 100 requests per 5 min
- `/api/reddit/ai-rank`: Unlimited (with spend alerts)
- `/api/v1/*`: Full access

**For automated tools (digest API):**
- Require API key
- Track per-key usage
- Alert if >$10/day in API costs

---

## 🎯 Next Steps

1. **Review this document**
2. **Prioritize which fixes to implement first**
3. **I'll build the landing pages while you decide on security approach**
4. **We can add rate limiting in parallel with landing page work**

Ready to proceed?
