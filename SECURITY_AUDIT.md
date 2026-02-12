# Reddit-Dashboarder Agent API v1 — Security Audit Report

**Date:** 2026-02-12  
**Auditor:** Rudi  
**Scope:** `/api/v1/*` endpoints, `/api/sync`, supporting infrastructure

---

## 🔴 CRITICAL — Fix Before Production

### 1. In-Memory Storage = Data Loss on Vercel
**Issue:** `syncStore` (Map) and `jobStore` (Map) are in-memory only.

**Risk:** Vercel serverless functions spin down after ~10s idle. All synced data and jobs are **lost on every cold start**.

**Evidence:**
```javascript
// lib/api-handlers/sync.js
const syncStore = new Map();  // Dies with the function

// lib/api-v1/handlers/jobs.js  
const jobStore = new Map();   // Same problem
```

**Fix:** Migrate to Vercel KV, Redis, or Upstash. Add persistence layer abstraction.

---

### 2. No Rate Limiting — Wide Open to Abuse
**Issue:** No rate limits on any endpoint.

**Risk:** 
- Brute force API key (`/api/v1/snapshot`, `/api/v1/config`)
- DoS via expensive analysis jobs (`POST /api/v1/analyze`)
- Sync store flooding (`POST /api/sync`)

**Fix:** Implement token bucket or sliding window rate limiting. Vercel has edge config for this.

---

### 3. Tokens in URL Query Parameters
**Issue:** `?token=...` exposes sync tokens in:
- Server access logs
- Browser history  
- CDN/proxy logs
- Referrer headers

**Evidence:**
```javascript
// lib/api-v1/handlers/snapshot.js
const token = url.searchParams.get('token');  // In URL!
```

**Fix:** Move token to `Authorization: Bearer <token>` header for sync access, separate from the API key.

---

### 4. No Request Size Limits on /api/sync
**Issue:** `express.json({ limit: '10mb' })` allows 10MB payloads to `/api/sync`.

**Risk:** Attacker can fill memory with massive POSTs before TTL cleanup.

**Fix:** 
```javascript
// Add specific limit for sync endpoint
app.use('/api/sync', express.json({ limit: '1mb' }));
```

---

### 5. CORS Too Permissive
**Issue:** `withCORS()` allows any origin.

**Evidence:**
```javascript
// lib/api-v1/cors.js (assumed)
res.setHeader('Access-Control-Allow-Origin', '*');
```

**Risk:** CSRF attacks, malicious sites calling your API with user's token.

**Fix:** Restrict to known origins or require auth headers (not cookies).

---

## 🟡 HIGH — Should Fix Soon

### 6. Sequential/Guesstable Job IDs
**Issue:** Job IDs use timestamp + random: `job_${timestamp}_${random}`

**Risk:** Enumeratable — attacker can poll `/api/v1/jobs/:jobId` for other users' analysis results.

**Fix:** Use cryptographically secure random:
```javascript
const jobId = `job_${crypto.randomBytes(16).toString('hex')}`;
```

---

### 7. No HTTPS Enforcement
**Issue:** No HSTS headers or HTTP→HTTPS redirect.

**Risk:** MITM attacks on insecure networks.

**Fix:** Add middleware:
```javascript
if (req.headers['x-forwarded-proto'] !== 'https') {
  return res.redirect(301, `https://${req.headers.host}${req.url}`);
}
```

---

### 8. Missing Input Validation on Posts Data
**Issue:** `POST /api/sync` stores `posts`, `settings`, `filters` without schema validation.

**Risk:** 
- Poisoned data breaking AI analysis
- Prototype pollution via `__proto__` or `constructor`

**Fix:** Validate with Zod or Joi before storing.

---

### 9. API Key in Environment Variable Only
**Issue:** Single `AGENT_API_KEY` for all users/agents.

**Risk:** 
- No user isolation
- Key rotation affects everyone
- No audit trail per user

**Fix:** Implement user-scoped API keys with database storage.

---

## 🟢 MEDIUM — Nice to Have

### 10. Audit Log is In-Memory Only
**Issue:** `auditLog` array in `config.js` is lost on restart.

**Fix:** Persist to database or logging service.

---

### 11. No Request ID Tracking
**Issue:** Hard to correlate errors across distributed logs.

**Fix:** Add `X-Request-ID` header propagation.

---

### 12. Error Messages Leak Implementation Details
**Issue:** Some errors expose internal state:
```javascript
.json(createErrorResponse(ERROR_CODES.INTERNAL_ERROR.code, error.message));
```

**Fix:** Log full error internally, return generic message externally.

---

## ✅ Security Controls That Work

| Control | Status | Notes |
|---------|--------|-------|
| API Key auth | ✅ | Bearer token check implemented |
| CORS headers | ✅ | Present (though too permissive) |
| TTL cleanup | ✅ | 24h expiry + hourly cleanup |
| Job TTL | ✅ | 1h cleanup for completed jobs |
| Method validation | ✅ | 405 on invalid methods |
| Response helpers | ✅ | Consistent error format |

---

## 📋 Recommended Priority Order

1. **Migrate to persistent storage** (Redis/Vercel KV) — CRITICAL
2. **Add rate limiting** — CRITICAL  
3. **Move token to headers** — CRITICAL
4. **Add request size limits** — HIGH
5. **Secure job IDs** — HIGH
6. **Add input validation** — HIGH
7. **HTTPS enforcement** — MEDIUM
8. **User-scoped API keys** — MEDIUM (future)

---

## Test Results

| Endpoint | Status | Notes |
|----------|--------|-------|
| `/api/health` | ❌ FAIL | FUNCTION_INVOCATION_FAILED |
| `/api/v1/snapshot` | ❌ FAIL | FUNCTION_INVOCATION_FAILED |
| `/api/sync/:token` | ❌ FAIL | FUNCTION_INVOCATION_FAILED |

**Root cause:** Likely missing `AGENT_API_KEY` or `OPENROUTER_API_KEY` env vars in production.

---

## Next Steps

1. Set required environment variables in Vercel dashboard
2. Fix critical security issues before monetization launch
3. Add integration tests for all endpoints
