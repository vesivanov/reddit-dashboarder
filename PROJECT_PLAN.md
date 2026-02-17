# Reddit Dashboarder — Project Plan (Approved 2026-02-17)

**Status:** Phase 2 in progress  
**Blockers:** Domain decision pending (Ves handling)  
**Completed:** CRON_SECRET_KEY added, Vercel KV setup done

---

## Phase 1: Security Hardening ✅

### 1.1 Rate Limiting Middleware ✅
- [x] Rate limiting already exists with three tiers:
  - `aiRankLimiter`: 10 req/15min (expensive AI calls)
  - `redditLimiter`: 30 req/5min (Reddit API)
  - `generalLimiter`: 60 req/min (read-only)
  - `waitlistLimiter`: 5 req/hour (signup protection)
- [x] Applied to all API routes including auth, settings, sync, v1 endpoints

### 1.2 API Key Authentication ✅
- [x] API key verification already exists in v1 handlers
- [x] All `/api/v1/*` endpoints protected with Bearer token auth
- [x] Uses `AGENT_API_KEY` env var for validation

### 1.3 Secure Sensitive Endpoints ✅
- [x] `/api/settings/server/openrouter-key` already has DIGEST_API_KEY auth
- [x] `/api/sync/:token` uses token-based access
- [x] All settings endpoints audited and have rate limiting

### 1.4 CORS Restrictions ✅
- [x] CORS already locked to known origins in `lib/cors.js`
- [x] Supports custom domain via `APP_DOMAIN` env var
- [x] Blocks requests from unexpected origins

### 1.5 Input Validation ✅
- [x] Add sanitization to waitlist endpoint
- [x] Add email format validation
- [x] Add max waitlist size limit
- [ ] Validate Reddit API parameters (if needed)
- [ ] Check OpenRouter request payload limits

---

## Phase 2: Bug Hunt & Polish

### 2.1 Polling System Verification ✅
- [x] Test `/api/v1/leads/latest` returns fresh data — Works (43 min old)
- [x] Verify cron runs every 2 hours — Data is fresh
- [x] Check data persistence in KV — Confirmed working
- [x] Test hot lead detection accuracy — 15 hot leads detected

### 2.2 OAuth Edge Cases ✅
- [x] Token refresh flow — Added `/api/auth/refresh` endpoint
- [x] Expired session handling — Clear cookies on refresh failure
- [x] Logout cleanup — Already handled in logout handler

### 2.3 Mobile Responsive ✅
- [x] Mobile view already implemented (mobileView state, bottom nav)
- [x] Three-pane layout responsive (hidden/show based on viewport)
- [x] Touch interactions handled (swipe gestures)

### 2.4 Error Handling ✅
- [x] Graceful Reddit API failures — Comprehensive error handling in reddit.js
- [x] OpenRouter timeout handling — User-friendly error codes for timeouts
- [x] Network error recovery — Retry logic with exponential backoff

---

## Phase 3: Landing Page ✅

**Built and ready to deploy.** Domain decision doesn't block this — works on vercel.app.

### Sections Built
1. ✅ Hero — Headline, subheading, CTA
2. ✅ Value props — 3 columns (AI, Multi-subreddit, Velocity)
3. ✅ How it works — 5 steps
4. ✅ Pricing — Free vs Pro tiers
5. ✅ CTA — "Start free now"
6. ✅ Footer — Links, GitHub

### Routing ✅
- `/` → landing.html
- `/app` → index.html (dashboard)
- `/api/*` → api/index.js

---

## Phase 4: Extensive Testing (IN PROGRESS)

| Layer | Scope | Status |
|-------|-------|--------|
| Unit | API handlers, utilities, sanitization | ⏳ In progress |
| Integration | Reddit API mocking, OpenRouter mocking | ⏳ Pending |
| E2E | Auth → add subreddit → rank → export | ⏳ In progress |
| Load | Rate limiting under stress | ⏳ Pending |

### Test Files Created
- [x] `__tests__/api/security.test.js` — Rate limiting, auth, validation, CORS
- [x] `__tests__/e2e/critical-flows.spec.js` — Critical user flows

---

## Phase 5: Documentation Site ✅

| Section | Content | Status |
|---------|---------|--------|
| Getting Started | OAuth setup, first dashboard | ✅ Complete |
| API Reference | `/api/v1/*` endpoints, examples | ✅ Complete |
| FAQ | Common issues, troubleshooting | ✅ Complete |

**Files created:**
- `public/docs/index.html` — Getting Started guide
- `public/docs/api.html` — API Reference
- `public/docs/faq.html` — FAQ

---

## Progress Log

### 2026-02-17
- [x] Plan approved and saved
- [x] Phase 1 complete — Security hardening pushed
- [x] Phase 2.1 complete — Polling verified working
- [x] Phase 2.2 complete — OAuth refresh endpoint added

