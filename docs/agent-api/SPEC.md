# Agent API v1 — Specification

## Base URL
```
https://reddit-dashboarder.vercel.app/api/v1
```

## Authentication
All requests require an API key in the `Authorization` header:
```
Authorization: Bearer rd_api_xxxxxxxx
```

## Common Response Fields
Every response includes:
| Field | Type | Description |
|-------|------|-------------|
| `schemaVersion` | string | API schema version (e.g., "1.0.0") |
| `requestId` | string | Unique request ID for debugging |
| `timings` | object | Performance metrics |
| `timings.totalMs` | number | Total request time |
| `data` | object | Response payload (endpoint-specific) |
| `error` | object \| null | Error details if failed |

---

## Endpoints

### GET /snapshot
Returns the latest data snapshot (posts + config + analysis).

**Request:**
```bash
curl -H "Authorization: Bearer rd_api_xxx" \
  https://reddit-dashboarder.vercel.app/api/v1/snapshot
```

**Response (200):**
```json
{
  "schemaVersion": "1.0.0",
  "requestId": "req_abc123",
  "timings": { "totalMs": 23 },
  "data": {
    "snapshot": {
      "id": "snap_abc123",
      "createdAt": "2026-02-11T15:20:00Z",
      "expiresAt": "2026-02-12T15:20:00Z"
    },
    "config": {
      "subreddits": ["SEO", "bigseo", "smallbusiness"],
      "filters": {
        "minScore": 3,
        "minComments": 1,
        "daysBack": 1
      },
      "goals": "Find SEO consulting leads",
      "threshold": 4
    },
    "posts": [
      {
        "id": "t3_abc123",
        "title": "Need SEO help for small business",
        "subreddit": "SEO",
        "author": "throwaway123",
        "score": 15,
        "numComments": 8,
        "createdUtc": 1739292000,
        "url": "https://reddit.com/r/SEO/comments/abc123/...",
        "preview": "Looking to hire an SEO consultant..."
      }
    ],
    "analysis": {
      "hotLeads": [
        {
          "postId": "t3_abc123",
          "hotScore": 12,
          "signals": ["intent: looking for", "service match: seo", "fresh (< 24h)"],
          "matchReason": "Intent detected + service match"
        }
      ],
      "hotLeadCount": 1,
      "totalPosts": 43,
      "lastAnalyzedAt": "2026-02-11T15:15:00Z"
    }
  },
  "error": null
}
```

**Errors:**
- `401 Unauthorized` — Invalid or missing API key
- `404 Not Found` — No snapshot available (user hasn't synced yet)

---

### GET /config
Get current monitoring configuration.

**Response (200):**
```json
{
  "schemaVersion": "1.0.0",
  "requestId": "req_def456",
  "timings": { "totalMs": 12 },
  "data": {
    "config": {
      "subreddits": ["SEO", "bigseo"],
      "filters": {
        "minScore": 3,
        "minComments": 1,
        "daysBack": 1
      },
      "goals": "Find SEO consulting leads",
      "aiPrompt": "Score posts 0-5 based on...",
      "threshold": 4,
      "model": "google/gemini-2.5-flash"
    },
    "updatedAt": "2026-02-11T14:00:00Z",
    "updatedBy": "user@example.com"
  },
  "error": null
}
```

---

### PATCH /config
Update monitoring configuration.

**Request:**
```bash
curl -X PATCH \
  -H "Authorization: Bearer rd_api_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "subreddits": ["SEO", "bigseo", "webdev"],
    "threshold": 3
  }' \
  https://reddit-dashboarder.vercel.app/api/v1/config
```

**Validation Rules:**
- `subreddits`: Array of strings, lowercase, no spaces, max 10
- `threshold`: Integer 0-5
- `goals`: String, max 500 chars
- `filters.minScore`: Integer >= 0
- `filters.daysBack`: Integer 1-7

**Response (200):**
```json
{
  "schemaVersion": "1.0.0",
  "requestId": "req_ghi789",
  "timings": { "totalMs": 45 },
  "data": {
    "config": { /* updated config */ },
    "auditLog": {
      "action": "CONFIG_UPDATE",
      "changedFields": ["subreddits", "threshold"],
      "previous": { "subreddits": [...], "threshold": 4 },
      "updatedAt": "2026-02-11T15:25:00Z"
    }
  },
  "error": null
}
```

**Errors (400):**
```json
{
  "schemaVersion": "1.0.0",
  "requestId": "req_err123",
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid configuration",
    "details": [
      { "field": "subreddits[0]", "message": "Contains spaces" },
      { "field": "threshold", "message": "Must be between 0 and 5" }
    ]
  }
}
```

---

### POST /analyze
Trigger async analysis (ranking/scoring).

**Request:**
```bash
curl -X POST \
  -H "Authorization: Bearer rd_api_xxx" \
  https://reddit-dashboarder.vercel.app/api/v1/analyze
```

**Response (202 Accepted):**
```json
{
  "schemaVersion": "1.0.0",
  "requestId": "req_jkl012",
  "timings": { "totalMs": 15 },
  "data": {
    "job": {
      "id": "job_mno345",
      "status": "queued",
      "createdAt": "2026-02-11T15:30:00Z",
      "estimatedDurationSeconds": 30
    }
  },
  "error": null
}
```

---

### GET /jobs/:jobId
Check analysis job status.

**Response (200) — Running:**
```json
{
  "schemaVersion": "1.0.0",
  "requestId": "req_pqr678",
  "timings": { "totalMs": 8 },
  "data": {
    "job": {
      "id": "job_mno345",
      "status": "running",
      "progress": {
        "postsScored": 23,
        "totalPosts": 43
      },
      "startedAt": "2026-02-11T15:30:05Z"
    }
  },
  "error": null
}
```

**Response (200) — Completed:**
```json
{
  "schemaVersion": "1.0.0",
  "requestId": "req_stu901",
  "timings": { "totalMs": 12 },
  "data": {
    "job": {
      "id": "job_mno345",
      "status": "completed",
      "result": {
        "postsScored": 43,
        "hotLeadCount": 3,
        "modelUsed": "google/gemini-2.5-flash",
        "costEstimate": { "cents": 2.5, "currency": "USD" }
      },
      "startedAt": "2026-02-11T15:30:05Z",
      "completedAt": "2026-02-11T15:30:28Z"
    }
  },
  "error": null
}
```

**Job Status Values:**
- `queued` — Waiting to start
- `running` — Analysis in progress
- `completed` — Done, result available
- `failed` — Error occurred (see `error` field)

---

## Error Codes

| Code | HTTP | Meaning |
|------|------|---------|
| `UNAUTHORIZED` | 401 | Invalid or missing API key |
| `NOT_FOUND` | 404 | Resource doesn't exist |
| `VALIDATION_ERROR` | 400 | Request failed validation |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Server error |

## Schema Versioning
- Format: `MAJOR.MINOR.PATCH`
- Breaking changes bump MAJOR
- Additive changes bump MINOR
- Fixes bump PATCH
- Current: `1.0.0`

## Rate Limits (Future)
- 100 requests/minute per API key
- 10 analysis jobs/hour per API key

## Changelog
- `1.0.0` — Initial spec (Phase 0-1)
