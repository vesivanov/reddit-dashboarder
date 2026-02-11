# Agent API v1 — Implementation Plan

## Overview
Build a productized, sellable API for AI agents to consume Reddit-Dashboarder data and control settings programmatically.

**Base URL:** `/api/v1`
**Authentication:** API keys (scoped, revocable, metered)

## Guiding Principles
- **API-first**: UI and agents use same underlying data
- **Stateful snapshots**: Agents get consistent, versioned payloads
- **Async by default**: No serverless timeouts
- **Observable**: Every request has `requestId`, `timings`, `costEstimate`
- **Backwards compatible**: `schemaVersion` in every response

## Phases

### Phase 0 — Foundations (This PR)
- [x] Create docs structure (`docs/agent-api/`)
- [ ] Add `PLAN.md` (this file)
- [ ] Add `SPEC.md` (endpoint contracts)
- [ ] Add shared response helpers (`requestId`, `timings`, `schemaVersion`)
- [ ] Add validation schemas (Joi/Zod)

**Outcome:** Documentation + infrastructure, no behavior changes.

### Phase 1 — Snapshot API (Read-Only)
**Goal:** One GET endpoint that agents can consume reliably.

**Endpoints:**
- `GET /api/v1/snapshot` — Returns latest posts + config + derived metrics

**Storage:**
- Server-side persisted "latest snapshot per user" (Redis/Upstash)
- 24h TTL, refreshed when user syncs from frontend

**Response includes:**
- `posts[]` (normalized)
- `config` (subs, filters, goals, thresholds)
- `analysis` (hot leads, scores if available)
- `meta` (schemaVersion, timestamps, requestId, timings)

**Outcome:** Agents can read the same data the user sees.

### Phase 2 — Config API (Safe Writes)
**Goal:** Agents can tune settings without UI.

**Endpoints:**
- `GET /api/v1/config` — Get current config
- `PATCH /api/v1/config` — Update config (validated)

**Validation:**
- Subreddit names (lowercase, no spaces)
- Thresholds (0-5 range)
- Prompts (length limits, no injection)

**Audit:**
- Every write logged (who/when/what changed)

**Outcome:** Agents can adjust monitoring parameters.

### Phase 3 — Async Analysis Jobs
**Goal:** Trigger ranking/analysis without timeouts.

**Endpoints:**
- `POST /api/v1/analyze` — Trigger analysis → returns `{ jobId }`
- `GET /api/v1/jobs/:jobId` — Check status/result

**Job states:** `queued` | `running` | `completed` | `failed`

**Snapshot reference:**
- `snapshot.analysisJobId` points to latest completed job
- `snapshot.meta.modelUsed`, `costEstimate` populated when done

**Outcome:** Heavy work (LLM calls) is async, agent polls or uses webhooks.

### Phase 4 — Billing & Scopes (Future)
**Goal:** Monetization-ready.

**Features:**
- Usage metering per API key
- Rate limits (requests/min, tokens/day)
- Scopes: `read:snapshot`, `write:config`, `run:analysis`
- Webhook callbacks for job completion

**Outcome:** Sellable, metered API access.

## Conventions

### Response Schema (Every endpoint)
```json
{
  "schemaVersion": "1.0.0",
  "requestId": "req_abc123",
  "timings": {
    "totalMs": 45,
    "dbMs": 12,
    "computeMs": 33
  },
  "data": { ... },
  "error": null
}
```

### Error Schema
```json
{
  "schemaVersion": "1.0.0",
  "requestId": "req_abc123",
  "error": {
    "code": "INVALID_CONFIG",
    "message": "Subreddit 'SEO Tips' contains spaces",
    "field": "subreddits[0]"
  }
}
```

## Compatibility Note
`/api/sync/:token` remains for personal use (your checks, internal tools).
`/api/v1/*` is the productized, sellable surface.
