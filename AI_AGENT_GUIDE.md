# AI Agent Guide

This repo exposes two agent-facing integration patterns:

- sync-token access for a user-synced snapshot
- API-key access for the `/api/v1/*` surface

Use sync when an agent needs the exact bundle the user just saw in the dashboard. Use `/api/v1/*` when the agent should read config, update config, or trigger async analysis jobs against a materialized server-owned snapshot/config model.

## 1. Sync Flow

The dashboard posts a snapshot to `POST /api/sync` and receives back a token. That token can then be used to fetch or delete the synced bundle.

Important:
- sync is snapshot transport, not the canonical backend config store
- backend scoring/poller config is controlled through `/api/v1/config`

### `POST /api/sync`

Stores the current frontend state for 24 hours.

Request body:

```json
{
  "token": "sync_token_here",
  "posts": [],
  "settings": {},
  "filters": {},
  "timestamp": "2026-03-08T12:00:00.000Z"
}
```

Response:

```json
{
  "success": true,
  "token": "sync_token_here",
  "postCount": 42,
  "expiresAt": "2026-03-09T12:00:00.000Z"
}
```

### `GET /api/sync/:token`

Returns the synced posts, settings, filters, and derived hot-lead analysis.

Example:

```bash
curl https://your-app.example/api/sync/SYNC_TOKEN
```

Response shape:

```json
{
  "success": true,
  "token": "SYNC_TOKEN",
  "syncedAt": "2026-03-08T12:00:00.000Z",
  "expiresAt": "2026-03-09T12:00:00.000Z",
  "data": {
    "posts": [],
    "settings": {},
    "filters": {},
    "timestamp": "2026-03-08T11:58:00.000Z"
  },
  "analysis": {
    "hotLeads": [],
    "totalPosts": 42,
    "hotLeadCount": 5
  }
}
```

### `DELETE /api/sync/:token`

Deletes the synced bundle.

## 2. Digest Endpoint

`GET /api/reddit/digest` is a protected proxy over the sync payload. It does not fetch Reddit again and does not rerun ranking. It returns the same synced data plus digest metadata.

Auth:

```text
Authorization: Bearer <DIGEST_API_KEY>
```

Usage:

```bash
curl -H "Authorization: Bearer $DIGEST_API_KEY" \
  "https://your-app.example/api/reddit/digest?token=SYNC_TOKEN"
```

Notes:

- `token` may also come from `DIGEST_SYNC_TOKEN`
- this is the safest endpoint to use when you want the latest user-approved bundle

## 3. Agent API v1

The `/api/v1/*` endpoints require `AGENT_API_KEY` in the `Authorization` header.

Auth:

```text
Authorization: Bearer <AGENT_API_KEY>
```

### `GET /api/v1/snapshot`

Returns normalized posts plus config and explicit analysis state.

Optional token source:

- `?token=SYNC_TOKEN`
- fallback to `DIGEST_SYNC_TOKEN`

Example:

```bash
curl -H "Authorization: Bearer $AGENT_API_KEY" \
  "https://your-app.example/api/v1/snapshot?token=SYNC_TOKEN"
```

### `GET /api/v1/config`

Returns the current materialized agent config. If no persisted backend config exists yet, the response can be derived from the synced snapshot for read purposes.

```bash
curl -H "Authorization: Bearer $AGENT_API_KEY" \
  "https://your-app.example/api/v1/config?token=SYNC_TOKEN"
```

### `PATCH /api/v1/config`

Updates materialized agent config after validation.

Operational effect:
- this is the canonical backend config write path
- successful updates also select the active backend workspace used by `/api/cron/refresh-leads`

Concurrency:
- send `If-Match: <version>` or `version` in the JSON body
- stale writes are rejected with `409 VERSION_CONFLICT`

Supported fields:

- `subreddits`
- `filters`
- `goals`
- `aiPrompt`
- `threshold`
- `model`

Example:

```bash
curl -X PATCH \
  -H "Authorization: Bearer $AGENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"threshold":4,"goals":"Find B2B SEO leads"}' \
  "https://your-app.example/api/v1/config?token=SYNC_TOKEN"
```

### `POST /api/v1/analyze`

Creates an async AI analysis job against the current materialized snapshot and pinned config version.

```bash
curl -X POST \
  -H "Authorization: Bearer $AGENT_API_KEY" \
  "https://your-app.example/api/v1/analyze?token=SYNC_TOKEN"
```

### `GET /api/v1/jobs/:jobId`

Polls an async job until it is `completed` or `failed`. Jobs are pinned to a `snapshotId` and `configVersion`.

### `POST /api/v1/jobs/drain`

Drains one queued or recoverable job. Use this from a worker, scheduler, or operational hook. `GET /api/v1/jobs/:jobId` is read-only and no longer triggers execution.

```bash
curl -H "Authorization: Bearer $AGENT_API_KEY" \
  "https://your-app.example/api/v1/jobs/JOB_ID"
```

## 4. Settings Endpoints

Two helpers are useful for automation:

- `GET|POST|DELETE /api/settings/openrouter-key`

`/api/settings/openrouter-key` stores the user OpenRouter key in a secure cookie for browser-driven sessions.

## 5. Storage and Expiry

- sync bundles use a 24 hour TTL
- agent snapshots inherit sync expiry
- agent config, audit state, and active poller workspace are server-owned and persist independently
- job storage depends on the configured backend
- persistence is only reliable when Redis or Vercel KV is configured

If the app is running on in-memory storage, synced data and jobs disappear on process restart or serverless cold replacement.

## 6. Operational Notes

- `/api/v1/leads/latest` is currently a public read endpoint for the latest stored polled leads
- `/api/cron/refresh-leads` is intended for scheduled refreshes and uses the active backend workspace
- `/api/v1/jobs/drain` must be wired into a worker/scheduler in production or queued analysis jobs will never execute
- rate limiting is applied in `app.js` across sync, Reddit, auth, and v1 routes
- the authoritative v1 contract draft lives in [docs/agent-api/SPEC.md](./docs/agent-api/SPEC.md)
