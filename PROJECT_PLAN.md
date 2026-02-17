# Reddit Dashboarder — Project Plan (Approved 2026-02-17)

**Status:** Phase 1 in progress  
**Blockers:** Domain decision pending (Ves handling)  
**Completed:** CRON_SECRET_KEY added, Vercel KV setup done

---

## Phase 1: Security Hardening (ACTIVE)

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

### 1.5 Input Validation
- [x] Add sanitization to waitlist endpoint
- [x] Add email format validation
- [x] Add max waitlist size limit
- [ ] Validate Reddit API parameters (if needed)
- [ ] Check OpenRouter request payload limits

---

## Phase 2: Bug Hunt & Polish

### 2.1 Polling System Verification
- [ ] Test `/api/v1/leads/latest` returns fresh data
- [ ] Verify cron runs every 2 hours
- [ ] Check data persistence in KV
- [ ] Test hot lead detection accuracy

### 2.2 OAuth Edge Cases
- [ ] Token refresh flow
- [ ] Expired session handling
- [ ] Logout cleanup

### 2.3 Mobile Responsive
- [ ] Test three-pane layout on mobile
- [ ] Fix touch interactions
- [ ] Verify sidebar behavior

### 2.4 Error Handling
- [ ] Graceful Reddit API failures
- [ ] OpenRouter timeout handling
- [ ] Network error recovery

---

## Phase 3: Landing Page (Blocked on Domain Decision)

**Option B: Separate Landing Page (Recommended)**

### Sections
1. Hero — Headline, subheading, CTA
2. Value props — 3 columns (AI, Speed, Lead Gen)
3. How it works — 5 steps
4. Social proof — Use cases
5. CTA — "Start free now"
6. Footer — Links, email capture

### Routing
```json
{
  "routes": [
    { "src": "/app", "dest": "/index.html" },
    { "src": "/", "dest": "/landing.html" },
    { "src": "/api/(.*)", "dest": "/api/index.js" }
  ]
}
```

---

## Phase 4: Extensive Testing

| Layer | Scope |
|-------|-------|
| Unit | API handlers, utilities, sanitization |
| Integration | Reddit API mocking, OpenRouter mocking |
| E2E | Auth → add subreddit → rank → export |
| Load | Rate limiting under stress |

---

## Phase 5: Documentation Site

| Section | Content |
|---------|---------|
| Getting Started | OAuth setup, first dashboard |
| API Reference | `/api/v1/*` endpoints, examples |
| Use Cases | SEO leads, trend monitoring, research |
| FAQ | Common issues, troubleshooting |

---

## Progress Log

### 2026-02-17
- [x] Plan approved and saved
- [ ] Phase 1.1: Rate limiting middleware (in progress)

