# Reddit Dashboarder

Reddit Dashboarder is a Reddit monitoring app with:

- a marketing landing page at `/`
- a React-based dashboard at `/app`
- Express/Vercel API routes for Reddit fetches, OAuth, AI ranking, sync, and agent automation

The current app is built from a single Express app (`app.js`) that runs locally via `server.js` and on Vercel via `api/index.js`.

## What Exists Today

- Reddit OAuth with PKCE under `/api/auth/*`
- Multi-subreddit dashboard in `public/index.html` with runtime split across `public/app.js`, `public/app-config.js`, and `public/app-utils.js`
- AI ranking through OpenRouter via `/api/reddit/ai-rank`
- Frontend-to-agent sync via `/api/sync` and `/api/sync/:token`
- Agent API v1 under `/api/v1/*`
- Background polling helpers including `/api/cron/refresh-leads`, `/api/v1/jobs/drain`, and `/api/v1/leads/latest`
- Secure OpenRouter key storage endpoints
- Static docs under `/docs`

## Stack

- Node.js 20
- Express
- Vercel serverless deployment
- Plain React in the browser via CDN scripts
- Reddit OAuth + Reddit JSON/API fetches
- OpenRouter for LLM ranking
- Storage abstraction with fallback order: Redis -> Vercel KV -> in-memory

## Current Model

- `/api/sync` stores the current dashboard snapshot only. It is not the canonical backend config store.
- `/api/v1/config` is the canonical backend scoring/monitoring config for agent-driven workflows.
- `/api/v1/snapshot` materializes a server-owned snapshot/config view for a sync token.
- `/api/cron/refresh-leads` reads the active backend poller workspace, not raw sync settings.
- `/api/v1/analyze` enqueues jobs, and `/api/v1/jobs/drain` must be run by a worker or scheduler to execute them.

## Project Layout

```text
api/
  index.js                Vercel entry for the Express app
  cron/refresh-leads.js   Polling endpoint
  v1/leads/latest.js      Latest stored leads endpoint
lib/
  api-handlers/           Main REST handlers
  api-v1/                 Agent API v1 handlers and helpers
  services/               AI ranking, Reddit fetch/auth, hot leads
  storage/                Redis, KV, memory adapters
public/
  landing.html            Marketing page for /
  index.html              Dashboard shell for /app
  app.js                  Frontend runtime
  app-config.js           Frontend constants and presets
  app-utils.js            Frontend helpers
  docs/                   Static docs pages
app.js                    Express app factory
server.js                 Local server entry
vercel.json               Routing for landing/app/api
```

## Local Development

Install dependencies and start the local server:

```bash
npm install
npm run local
```

Local app URLs:

- `http://localhost:3000/` -> landing page
- `http://localhost:3000/app` -> dashboard
- `http://localhost:3000/docs` -> docs

## Environment Variables

Required for Reddit auth:

```bash
REDDIT_CLIENT_ID=...
REDDIT_CLIENT_SECRET=...
REDDIT_REDIRECT_URI=http://localhost:3000/api/auth/callback
SESSION_COOKIE_SECRET=...
```

Optional but commonly used:

```bash
OPENROUTER_API_KEY=...
OPENROUTER_MODEL=google/gemini-2.0-flash-exp:free
APP_BASE_URL=http://localhost:3000
REDDIT_USER_AGENT=RedditDashboarder/1.0
AGENT_API_KEY=...
DIGEST_API_KEY=...
DIGEST_SYNC_TOKEN=...
REDIS_URL=...
KV_REST_API_URL=...
KV_REST_API_TOKEN=...
CRON_SECRET_KEY=...
```

Notes:

- `AGENT_API_KEY` protects `/api/v1/snapshot`, `/api/v1/config`, `/api/v1/analyze`, and `/api/v1/jobs/:jobId`.
- `DIGEST_API_KEY` protects `/api/reddit/digest` and server-side OpenRouter key endpoints.
- Without Redis or Vercel KV, sync/jobs/leads storage falls back to memory and is not persistent across restarts.

## API Surface

Core app routes:

- `GET /api/reddit`
- `GET /api/reddit/snapshot`
- `POST /api/reddit/ai-rank`
- `GET /api/reddit/digest`
- `GET /api/openrouter/models`
- `GET /api/health`

Auth and settings:

- `GET /api/auth/start`
- `GET /api/auth/callback`
- `GET /api/auth/status`
- `GET /api/auth/refresh`
- `GET /api/auth/logout`
- `GET|POST|DELETE /api/settings/openrouter-key`
- `GET|POST|DELETE /api/settings/server/openrouter-key`

Sync and agent automation:

- `POST /api/sync`
- `GET|DELETE /api/sync/:token`
- `GET /api/v1/snapshot`
- `GET|PATCH /api/v1/config`
- `POST /api/v1/analyze`
- `POST /api/v1/jobs/drain`
- `GET /api/v1/jobs/:jobId`
- `GET /api/v1/leads/latest`

## Deployment

`vercel.json` currently routes:

- `/` -> `public/landing.html`
- `/app` and `/app/*` -> `public/index.html`
- `/api/*` -> `api/index.js`
- filesystem assets first, then SPA fallback to `public/index.html`

The same Express app also runs locally through `server.js`.

## Storage Model

`lib/storage/index.js` chooses the first available backend:

1. Redis via `REDIS_URL`
2. Vercel KV via `KV_REST_API_URL` + `KV_REST_API_TOKEN`
3. In-memory fallback

Use Redis or KV for any deployed environment where sync tokens, analysis jobs, or polled leads need to survive restarts.

## Production Notes

- Background polling uses the active backend workspace selected via `PATCH /api/v1/config`.
- Async analysis jobs are queued. They will not run in production unless something calls `POST /api/v1/jobs/drain` on a schedule or from a worker.
- In-memory storage is not production-safe for sync snapshots, job state, poller state, or active workspace selection.

## Related Docs

- [AI_AGENT_GUIDE.md](./AI_AGENT_GUIDE.md) for sync flow and agent-facing endpoints
- [design-system.md](./design-system.md) for dashboard UI conventions
- [docs/agent-api/SPEC.md](./docs/agent-api/SPEC.md) for the v1 endpoint contract draft
