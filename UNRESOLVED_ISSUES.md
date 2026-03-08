# Unresolved Issues

## Purpose

This file captures the meaningful unresolved issues left in the codebase after the recent cleanup work. These are not all bugs. Some are architectural decisions that should be made explicitly before further refactoring.

## 1. Backend Config And Poller Source Of Truth Are Now Explicit

Files:
- [lib/poller.js](/Users/vesivanov/Documents/Code/reddit-dashboarder/lib/poller.js)
- [lib/services/ai-ranking.js](/Users/vesivanov/Documents/Code/reddit-dashboarder/lib/services/ai-ranking.js)
- [lib/api-v1/handlers/config.js](/Users/vesivanov/Documents/Code/reddit-dashboarder/lib/api-v1/handlers/config.js)
- [api/cron/refresh-leads.js](/Users/vesivanov/Documents/Code/reddit-dashboarder/api/cron/refresh-leads.js)
- [lib/services/poller-config.js](/Users/vesivanov/Documents/Code/reddit-dashboarder/lib/services/poller-config.js)
- [lib/repos/poller-runtime.js](/Users/vesivanov/Documents/Code/reddit-dashboarder/lib/repos/poller-runtime.js)

Status:
- Poller and dashboard/agent flows now share the same OpenRouter prompt-building and parsing path through `lib/services/ai-ranking.js`.
- Backend config is now owned by `/api/v1/config`.
- Sync no longer writes backend poller config.
- Cron now reads the active backend workspace rather than sync-derived bootstrap data.

Status outcome:
- This item is resolved at the code level.

## 2. Persistent Storage Naming Is Still Misleading

Files:
- [lib/storage/backend.js](/Users/vesivanov/Documents/Code/reddit-dashboarder/lib/storage/backend.js)
- [lib/credential-stores/reddit-refresh-token-store.js](/Users/vesivanov/Documents/Code/reddit-dashboarder/lib/credential-stores/reddit-refresh-token-store.js)
- [lib/api-handlers/admin/token.js](/Users/vesivanov/Documents/Code/reddit-dashboarder/lib/api-handlers/admin/token.js)
- [lib/api-handlers/auth/callback.js](/Users/vesivanov/Documents/Code/reddit-dashboarder/lib/api-handlers/auth/callback.js)

Status:
- The code now uses a shared persistent backend abstraction.
- Most API names and messages have been renamed toward generic persistent-store terminology.
- Remaining cleanup is documentation-focused rather than behavior-focused.

Examples:
- README and guide text still mention Vercel KV explicitly where they describe supported backends
- internal storage keys still use `KV_*` naming in a few places even though they are no longer user-facing

Why unresolved:
- Behavior is correct enough.
- The user-facing naming drift is mostly fixed.
- There is still some internal/documentation inconsistency that can confuse future maintenance.

Recommended next step:
- Rename toward generic persistent-store terminology.

## 3. Legacy Vercel KV Support Still Exists

Files:
- [lib/storage/backend.js](/Users/vesivanov/Documents/Code/reddit-dashboarder/lib/storage/backend.js)
- [lib/credential-stores/reddit-refresh-token-store.js](/Users/vesivanov/Documents/Code/reddit-dashboarder/lib/credential-stores/reddit-refresh-token-store.js)
- [README.md](/Users/vesivanov/Documents/Code/reddit-dashboarder/README.md)

Status:
- Legacy KV support is still implemented and documented.

Why unresolved:
- This is only removable if production no longer depends on `KV_REST_API_URL` / `KV_REST_API_TOKEN`.
- No deployment audit was done in this session.

Recommended next step:
- Check actual production environment usage before removing KV compatibility.

## 4. Poller/Test Coverage Is Better, But Still Not Comprehensive

Files:
- [__tests__/unit/lib/poller.test.js](/Users/vesivanov/Documents/Code/reddit-dashboarder/__tests__/unit/lib/poller.test.js)
- [__tests__/api/v1/leads-latest.test.js](/Users/vesivanov/Documents/Code/reddit-dashboarder/__tests__/api/v1/leads-latest.test.js)

Status:
- Characterization tests now exist for the poller and latest-leads endpoint.

What is still missing:
- Route-level coverage for `api/cron/refresh-leads.js` now exists, but there is still no full end-to-end test exercising the real poller path through storage and external integrations
- No full end-to-end test for the job drain worker path in a production-like loop

Why unresolved:
- The current tests are enough to stabilize refactoring boundaries.
- They do not fully specify production execution wiring and external-integration behavior.

## 5. Agent API Still Depends On Sync Materialization For Snapshot Availability

Files:
- [lib/api-handlers/sync.js](/Users/vesivanov/Documents/Code/reddit-dashboarder/lib/api-handlers/sync.js)
- [lib/api-v1/handlers/snapshot.js](/Users/vesivanov/Documents/Code/reddit-dashboarder/lib/api-v1/handlers/snapshot.js)
- [lib/api-v1/handlers/config.js](/Users/vesivanov/Documents/Code/reddit-dashboarder/lib/api-v1/handlers/config.js)
- [lib/api-v1/handlers/jobs.js](/Users/vesivanov/Documents/Code/reddit-dashboarder/lib/api-v1/handlers/jobs.js)

Status:
- The v1 agent API now has server-owned config, snapshot, audit, and analysis persistence layers.
- Config ownership is now separate from sync.
- Snapshot materialization still depends on sync input when no server-owned snapshot already exists.

Why unresolved:
- This works operationally and is a meaningful improvement.
- It still means snapshot freshness and initial snapshot creation are coupled to sync availability and sync-shaped source records.

Risk:
- Frontend-oriented data shape decisions bleed into the agent surface.
- Long-term product/API evolution may remain awkward.

Recommended next step:
- Decide whether long-lived backend workflows should eventually fetch/source posts without requiring dashboard sync at all.

## 6. Dirty Worktree Means Some Broader Conclusions Are Environment-Sensitive

Status:
- The repository already contained substantial in-progress changes unrelated to this cleanup.

Why unresolved:
- Some architecture signals may reflect active migration work already underway.
- This especially affects storage and credential-store conclusions.

Recommended next step:
- Re-evaluate unresolved items after the current branch/worktree stabilizes.

## What Was Resolved In This Session

- Removed legacy settings import/export route and UI.
- Removed the old AI array-response fallback in the frontend.
- Consolidated v1 snapshot hot-lead logic onto shared service code.
- Removed redundant sync export alias and poller wrapper method.
- Unified poller OpenRouter transport/parsing onto shared AI service code.
- Unified poller prompt generation onto shared scoring config and v1 config.
- Removed the obsolete `lib/scoring-engine.js` prompt fork.
- Added characterization tests for poller behavior and `/api/v1/leads/latest`.

## Common-Sense Next Move

Do not continue with blind cleanup.

The next sensible step is to write a short architecture note answering:

1. Should backend workflows continue to depend on sync-created snapshots, or should they gain a fully server-owned fetch path?
2. What operational component will own `/api/v1/jobs/drain` in production?
3. Is legacy Vercel KV support still required in production?

After those decisions are explicit, the remaining cleanup becomes straightforward.
