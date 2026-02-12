# Reddit-Dashboarder - Technical Improvements Plan

## Current Architecture Overview
- **Frontend:** Single HTML file with vanilla JS, React-like state management
- **Backend:** Express/Vercel serverless functions
- **AI Ranking:** OpenRouter integration with adaptive batching
- **Sync:** Simple 24h TTL in-memory store (frontend-AI data exchange)
- **Auth:** Reddit OAuth with signed cookies

---

## Priority Improvements

### 1. AI Ranking Improvements 🎯

**Current State:**
- Prompt v3.1 with 0-5 scoring rubric
- Adaptive batching (max 30 posts, 8000 tokens)
- Sequential batch processing with 500ms delay
- Returns scores + metadata (confidence, reason)

**Issues to Fix:**
- [ ] **Model fallback** — If primary model fails, retry with fallback models (implemented but verify working)
- [ ] **Retry logic for failed batches** — Currently marks as null, should retry with backoff
- [ ] **Token estimation** — Currently ~4 chars/token, could be more accurate with tiktoken
- [ ] **Prompt optimization** — A/B test prompts for better relevance scores
- [ ] **Caching** — Cache AI scores per post (hash by title+content) to save API costs

**Code Locations:**
- `lib/api-handlers/reddit/ai-rank.js`

---

### 2. Performance & Reliability 🚀

**Issues to Fix:**
- [ ] **Add request timeout metrics** — Track slow requests in metrics header
- [ ] **Circuit breaker pattern** — If OpenRouter fails N times, temporarily disable AI ranking
- [ ] **Better error messages** — Surface actionable errors to frontend
- [ ] **Request deduplication** — Don't process identical AI ranking requests simultaneously
- [ ] **Memory leak prevention** — syncStore cleanup is hourly, verify it's working

**Code Locations:**
- `lib/api-handlers/sync.js` (syncStore cleanup)
- `lib/api-handlers/reddit/ai-rank.js` (error handling)

---

### 3. Security Hardening 🔒

**Issues to Fix:**
- [ ] **Rate limiting** — Add per-IP rate limiting on AI ranking endpoint
- [ ] **Input validation** — Validate post data structure before processing
- [ ] **Token length limits** — Cap userGoals/userContext to prevent prompt injection
- [ ] **Sanitize post content** — Remove potential XSS from selftext before AI processing
- [ ] **API key rotation** — Support multiple DIGEST_API_KEYs for rolling updates

**Code Locations:**
- `app.js` (middleware)
- `lib/api-handlers/reddit/ai-rank.js` (input validation)
- `lib/api-handlers/reddit/digest.js` (API key verification)

---

### 4. Hot Lead Detection Improvements 🔥

**Current State:**
- `identifyHotLeads()` in sync.js scores posts by:
  - Intent keywords (looking for, need, hire, etc.)
  - Service keywords (seo, search, traffic, etc.)
  - Freshness (< 24h = +5, < 48h = +2)
  - Engagement velocity (upvotes/hour, comments/hour)
  - AI relevance score (if >= 4, +5)

**Issues to Fix:**
- [ ] **Negative keywords** — Exclude "hired", "closed", "found", "solved" to avoid stale posts
- [ ] **Location filtering** — Detect location mentions for Berlin-based leads
- [ ] **Budget detection** — Extract "$Xk", "$X,000", "budget" amounts
- [ ] **Urgency scoring** — Detect "urgent", "asap", "this week", "deadline"
- [ ] **Lead categorization** — Tag leads: "Hiring", "Seeking Advice", "Vent/Frustration"

**Code Locations:**
- `lib/api-handlers/sync.js` (identifyHotLeads function)

---

### 5. API Enhancements 📡

**Issues to Fix:**
- [ ] **Pagination for /api/sync** — If posts > 100, paginate the response
- [ ] **Filtering endpoint** — Add `/api/sync/:token/filter` for server-side filtering
- [ ] **Webhook support** — POST hot leads to external URL when identified
- [ ] **Export endpoint** — `/api/export/csv` for downloading leads
- [ ] **Search endpoint** — `/api/sync/:token/search?q=keyword` for searching posts

**Code Locations:**
- `lib/api-handlers/sync.js`
- New file: `lib/api-handlers/export.js`

---

### 6. Monitoring & Observability 📊

**Issues to Fix:**
- [ ] **Structured logging** — JSON logs with request_id, user_id, endpoint
- [ ] **Metrics dashboard** — Track: requests/min, AI ranking latency, cache hit rate
- [ ] **Error alerting** — Alert if error rate > 5% in 5 minutes
- [ ] **Health check improvements** — Test Reddit API connectivity, OpenRouter status
- [ ] **Usage analytics** — Track: active users, posts processed, leads found

**Code Locations:**
- `lib/api-handlers/health.js`
- `app.js` (request logging middleware)

---

### 7. Bug Fixes 🐛

**Known/Potential Issues:**
- [ ] **Cookie overflow** — If user has many subreddits, cookie might exceed size limit
- [ ] **Race condition in token refresh** — Multiple concurrent requests might trigger multiple refreshes
- [ ] **Memory pressure** — syncStore holds all data in memory, could OOM with many users
- [ ] **Timezone issues** — created_utc conversion might be off in some edge cases
- [ ] **CORS preflight caching** — Some browsers might cache OPTIONS responses incorrectly

**Code Locations:**
- `lib/cookies.js`
- `lib/api-handlers/reddit.js` (token manager)
- `lib/api-handlers/sync.js`

---

## Implementation Priority

### Phase 1 (This Week) — Critical
1. Add negative keywords to hot lead detection
2. Add rate limiting
3. Fix race condition in token refresh
4. Input validation on AI ranking

### Phase 2 (Next Week) — Important
5. Implement retry logic for failed AI batches
6. Add caching for AI scores
7. Improve error messages
8. Add structured logging

### Phase 3 (Later) — Nice to Have
9. Webhook support
10. Export endpoint
11. Metrics dashboard
12. Budget/urgency extraction

---

## Testing Strategy

**Unit Tests Needed:**
- `identifyHotLeads()` — Test with various post combinations
- `buildBatches()` — Verify batch sizing logic
- `clampScore()` — Edge cases
- Token refresh logic — Mock Reddit API

**Integration Tests:**
- Full flow: fetch posts → AI rank → sync → hot leads
- Error scenarios: timeout, 500 from OpenRouter, invalid auth

**Load Tests:**
- 100 concurrent AI ranking requests
- 1000 posts in single sync

---

## Code Quality Improvements

- [ ] **JSDoc comments** — Document all exported functions
- [ ] **TypeScript migration** — Gradual TS adoption for better safety
- [ ] **Linting** — Add ESLint with strict rules
- [ ] **Consistent error handling** — Standardize error responses
- [ ] **Environment validation** — Check all required env vars on startup
