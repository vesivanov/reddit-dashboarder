# Unresolved Issues

This file tracks the remaining meaningful issues after the workspace refactor and optional-surface cleanup.

## 1. Frontend Composition Is Better, But `public/app.js` Is Still Large

Status:
- The dashboard runtime is now split across focused browser modules for storage, workspace sync, fetch transport, AI flow, refresh control, and post-detail helpers.
- The main file is much smaller in responsibility than before, but it is still large enough to justify more presentational extraction.

What remains:
- More UI-only sections can still move out of `public/app.js` into dedicated rendering modules.
- The detail pane and some list rendering logic are still tightly coupled to top-level state.

## 2. Agent Snapshot Creation Still Depends On Sync

Status:
- Workspace-backed config, snapshot, and job flows are now canonical.
- Legacy compatibility routes still work.

What remains:
- The first server-owned snapshot still originates from dashboard sync.
- There is still no fully server-owned fetch path for agent workflows independent of the dashboard.

## 3. Storage Backend Naming Still Reflects Legacy KV History

Status:
- Runtime behavior is fine.
- Redis, legacy KV, and memory fallback still coexist.

What remains:
- Some naming and docs still reflect old KV terminology more than ideal.
- This is a clarity issue, not a correctness problem.

## 4. Product Planning Notes Need Another Pass

Status:
- Runtime code and public routes are now much simpler than earlier architecture notes assumed.

What remains:
- Longer planning documents like `OPPORTUNITY_ENGINE_PLAN.md` still contain references to removed poller-era ideas.
- Those notes should be refreshed so they describe the current workspace-centered product shape.
