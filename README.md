# Reddit Dashboarder

Reddit Dashboarder is evolving from a Reddit monitoring app with AI relevance scoring into a commercial opportunity intelligence engine for sales and marketing workflows.

The product direction is:

- detect commercially useful Reddit conversations
- classify the type of opportunity each conversation represents
- rank opportunities for action
- recommend what the user should do next

The current app includes:

- a marketing landing page at `/`
- a React-based dashboard at `/app`
- Express/Vercel API routes for Reddit fetches, OAuth, AI ranking, workspace state, and agent automation

The current app is built from a single Express app (`app.js`) that runs locally via `server.js` and on Vercel via `api/index.js`.

## Product Direction

The legacy system is centered around generic AI relevance scoring. The new direction is opportunity-first:

- opportunity feed instead of score feed
- structured commercial signals instead of one opaque score
- recommended action instead of generic "high relevance"

This broader framing still supports lead discovery, but also makes room for:

- pain-point discovery
- tool-search monitoring
- competitor mentions
- content opportunities
- commercial research workflows

Detailed planning lives in [OPPORTUNITY_ENGINE_PLAN.md](./OPPORTUNITY_ENGINE_PLAN.md).

## What Exists Today

- Reddit OAuth with PKCE under `/api/auth/*`
- Multi-subreddit dashboard in `public/index.html` with runtime split across `public/app.js`, `public/app-config.js`, and `public/app-utils.js`
- AI ranking through OpenRouter via `/api/reddit/ai-rank`
- Workspace bootstrap and state via `/api/workspaces` and `/api/workspaces/:workspaceId/*`
- Async analysis jobs via `/api/v1/jobs/drain`
- Secure OpenRouter key storage endpoints

The ranking stack is currently in transition from generic `aiRelevance` scoring to structured opportunity analysis.

## Stack

- Node.js 20
- Express
- Vercel serverless deployment
- Plain React in the browser via CDN scripts
- Reddit OAuth + Reddit JSON/API fetches
- OpenRouter for LLM ranking
- Storage abstraction with fallback order: Redis -> Vercel KV -> in-memory

## Current Model

- `POST /api/workspaces` bootstraps or resolves the canonical workspace for a dashboard token.
- `PUT /api/workspaces/:workspaceId/snapshot` stores the canonical dashboard snapshot.
- `GET|PATCH /api/workspaces/:workspaceId/config` is the canonical backend scoring/monitoring config.
- `POST /api/workspaces/:workspaceId/analyze` enqueues jobs, and `POST /api/v1/jobs/drain` must be run by a worker or scheduler to execute them.

## Project Layout

```text
api/
  index.js                Vercel entry for the Express app
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
REDIS_URL=...
KV_REST_API_URL=...
KV_REST_API_TOKEN=...
CRON_SECRET_KEY=...
```

Notes:

- `AGENT_API_KEY` authorizes workspace snapshot/config/analyze/job routes for agent callers.
- Without Redis or Vercel KV, workspace/job storage falls back to memory and is not persistent across restarts.

## API Surface

Core app routes:

- `GET /api/reddit`
- `GET /api/reddit/snapshot`
- `POST /api/reddit/ai-rank`
- `GET /api/openrouter/models`
- `GET /api/health`

Auth and settings:

- `GET /api/auth/start`
- `GET /api/auth/callback`
- `GET /api/auth/status`
- `GET /api/auth/refresh`
- `GET /api/auth/logout`
- `GET|POST|DELETE /api/settings/openrouter-key`

Workspace and agent automation:

- `POST /api/workspaces`
- `GET|PUT /api/workspaces/:workspaceId/snapshot`
- `GET|PATCH /api/workspaces/:workspaceId/config`
- `POST /api/workspaces/:workspaceId/analyze`
- `GET /api/workspaces/:workspaceId/jobs/:jobId`
- `POST /api/v1/jobs/drain`

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

Use Redis or KV for any deployed environment where workspace state and analysis jobs need to survive restarts.

## Production Notes

- Async analysis jobs are queued. They will not run in production unless something calls `POST /api/v1/jobs/drain` on a schedule or from a worker.
- In-memory storage is not production-safe for workspace snapshots or job state.

## Related Docs

- [design-system.md](./design-system.md) for dashboard UI conventions
