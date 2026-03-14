# Fetching Process

This document describes the entire Reddit fetching pipeline in `reddit-dashboarder` as it exists today.

Current default mode is local-first:

- the browser keeps the last fetched dataset locally
- the server fetch path stays canonical
- large Redis-backed fetch persistence is not part of the normal fetch path
- small config/workspace state may still be persisted server-side

It covers:

- the browser refresh flow
- the canonical fetch API
- internal coverage/checkpoint APIs
- lower-level live-fetch behavior
- Reddit auth and rate-limit handling
- browser persistence and small server-side persistence
- post-fetch workspace sync

## Current Architecture

There is one canonical frontend fetch path:

- Browser refresh calls `GET /api/reddit/snapshot`

That endpoint is server-owned and is the path the UI should rely on.

Persistence defaults:

- browser dataset persistence: enabled
- post-fetch workspace snapshot sync: disabled by default

Under the hood, `GET /api/reddit/snapshot` does this:

1. Forward the request to `GET /api/reddit`.
2. Return the normalized response with lightweight snapshot metadata attached.

Important distinction:

- `GET /api/reddit/snapshot` is the canonical browser API.
- `GET /api/reddit/coverage`, `DELETE /api/reddit/coverage`, and `POST /api/reddit/advance` are lower-level internal checkpoint APIs.
- `GET /api/reddit` is the lower-level live fetch API that powers snapshot.

## High-Level End-to-End Flow

### Browser refresh

When the user clicks `Refresh posts`, the dashboard:

1. Builds the request from current UI state:
   - `subs`
   - `mode`
   - `time`
   - `days`
   - `limit`
   - `max_pages`
   - optional force-refresh flags
2. Sends one or more `GET /api/reddit/snapshot?...` requests.
3. Merges the chunked responses in the browser.
4. Updates in-memory UI state with normalized per-subreddit groups.
5. Persists the latest fetched dataset into browser storage.
6. Stores fetch summary and rate-limit pause state.
7. Starts AI ranking on the fetched posts.

### Server fetch path

For each snapshot request:

1. `GET /api/reddit/snapshot` forwards the request to `GET /api/reddit`.
2. `GET /api/reddit` performs the live normalized fetch.
3. Snapshot adds lightweight metadata and returns the response to the browser.

With current defaults:

- snapshot is an uncached passthrough wrapper over normalized live fetch

## Browser-Side Fetch Flow

Primary files:

- `public/app.js`
- `public/app-refresh.js`
- `public/app-fetch.js`
- `public/app-workspace.js`

### Refresh entrypoint

The main refresh callback lives in `public/app.js`.

Current behavior:

- The browser uses the server-owned snapshot path for normal refreshes.
- The browser persists fetched data locally so reload/reopen does not require server snapshot persistence.

### Request shaping in the browser

Before calling the API, the browser shapes the request:

- `getEffectiveMaxPages(maxPages, subsCount)`
- `determineSnapshotChunkSize({ subsCount, wantsDeepFetch })`
- `shapeSnapshotChunk({ chunkLength, limit, maxPages })`

This does two things:

- caps request depth for larger subreddit sets
- splits very large fetches into multiple snapshot calls

Example:

- many subreddits -> lower `max_pages`
- many subreddits -> chunked requests instead of one giant call

### Snapshot request helper

`requestSnapshotChunk()` in `public/app-fetch.js`:

- sends `GET /api/reddit/snapshot?...`
- on force refresh, appends `fresh=1` and `_ts=...`
- retries once on force-refresh requests if the fresh variant returns `5xx`
- parses JSON if response is `200` or `429`
- extracts:
  - `ok`
  - `status`
  - `payload`
  - `rateLimitedHeader`
  - `retryAfterSeconds`

### Browser response handling

`runSnapshotRefreshFlow()` in `public/app-refresh.js`:

- sets fetch mode to `server`
- requests all chunks
- merges chunk payloads into one aggregate fetch payload
- updates:
  - `data`
  - `fetchedAt`
  - `snapshotInfo`
  - `fetchSummary`
  - `fetchActivity`
  - `rateLimitPauseUntil`
- preserves previous subreddit data if a chunk omits a subreddit
- marks stale fallback states where needed

After posts are in memory:

1. If the fetch was authenticated, sync to workspace snapshot.
2. Run AI ranking.
3. Optionally emit browser notifications.

### Browser rate-limit handling

The browser respects:

- HTTP `429`
- `X-Rate-Limited: 1`
- `Retry-After`
- response fields like `retry_after_seconds`

If a rate limit is active, the browser:

- sets `rateLimitPauseUntil`
- surfaces an error message
- delays auto-refresh until cooldown expires

## Canonical API: `GET /api/reddit/snapshot`

Primary file:

- `lib/api-handlers/reddit/snapshot.js`

### Purpose

This is the canonical browser fetch API.

It returns a ready-to-render Reddit fetch payload plus snapshot metadata.

### Method

`GET /api/reddit/snapshot`

### Query parameters

- `subs`: comma-separated subreddit list
- `mode`: `new` or `top`
- `time`: used for `top` mode, commonly `day`, `week`, `month`, etc.
- `days`: target age window for `new` mode, `1..7`
- `target_window_days`: optional effective completion window for coverage materialization, `1..5`
- `limit`: requested page size
- `max_pages`: page depth, integer or `all`
- `fresh` or `force_refresh`: forwarded to lower-level handlers that may interpret it

### Request example

```http
GET /api/reddit/snapshot?subs=seo,shopify&mode=new&days=3&limit=25&max_pages=5
```

### Snapshot behavior

`GET /api/reddit/snapshot` is now a thin server-owned wrapper over `GET /api/reddit`.

It does not maintain its own Redis-backed snapshot cache.

### Snapshot response headers

- `X-RDD-Snapshot: MISS`
- `X-Rate-Limited: 1` when applicable
- `Retry-After: <seconds>` when applicable

### Snapshot response shape

Top-level fields:

- `mode`
- `time`
- `days`
- `limit`
- `max_pages`
- `fetch_all_pages`
- `auth_mode`
- `results`
- `fetched_at`
- `request_capped`
- `rate_limited`
- `rate_limited_subreddits`
- `retry_after_seconds`
- `timed_out`
- `timed_out_subreddits`
- `coverage_summary`
- `metrics`
- `snapshot`

Each `results[]` entry contains:

- `subreddit`
- `meta`
- `posts`
- `partial`
- `coverage_state`
- `error`
- optional `error_code`
- optional `retry_after_seconds`
- optional `timed_out`

Each normalized post contains:

- `id`
- `subreddit`
- `title`
- `selftext`
- `selftext_html`
- `author`
- `reddit_url`
- `external_url`
- `domain`
- `score`
- `num_comments`
- `created_utc`
- `thumbnail`
- flair fields

### Snapshot response notes

The `snapshot` object is lightweight:

- `cached: false`
- `stale: false`

Snapshot exists so the browser has a stable canonical endpoint and can still distinguish snapshot responses from lower-level `GET /api/reddit` calls.

## Internal Coverage APIs

Primary files:

- `lib/api-handlers/reddit/coverage.js`
- `lib/repos/reddit-coverage.js`

### Purpose

These endpoints still exist for lower-level checkpoint management, but they are no longer in the normal browser fetch path.

### Completion logic

For `mode=new`, a subreddit is considered complete if:

- state status is `complete`, or
- `covered_through_utc <= cutoffUtc`

where:

- `cutoffUtc = now - targetWindowDays * 86400`

### Page cap logic

A subreddit is considered capped when:

- `effectiveMaxPages !== 0`
- `page_count >= effectiveMaxPages`
- coverage is not yet complete

### Shared cooldown behavior

The coverage handlers read and write a shared expiring value:

- key: `reddit:upstream-cooldown`

This lets one request's upstream Reddit cooldown affect later requests, instead of hammering Reddit again immediately.

### `GET /api/reddit/coverage`

Purpose:

- return current persisted coverage bundle summary and any stored posts

Query parameters:

- `subs`
- `mode`
- `time`
- `days`
- `target_window_days`

Behavior:

- computes deterministic `scopeId`
- loads persisted bundle from storage
- resets stale coverage if old enough
- returns summary plus any stored results

Example response:

```json
{
  "scopeId": "rcov_abcd1234",
  "storage": { "persistent": false, "kind": "memory" },
  "summary": {
    "totalSubreddits": 2,
    "complete1dCount": 1,
    "complete3dCount": 0,
    "complete5dCount": 0,
    "totalPosts": 18,
    "subreddits": []
  },
  "results": []
}
```

### `DELETE /api/reddit/coverage`

Purpose:

- clear persisted coverage bundle for the request shape

Query parameters:

- same as `GET /api/reddit/coverage`

Response:

```json
{
  "success": true,
  "scopeId": "rcov_abcd1234",
  "storage": { "persistent": false, "kind": "memory" }
}
```

### `POST /api/reddit/advance`

Purpose:

- fetch one additional page for one subreddit inside a persisted coverage bundle

Body:

- `subs`
- `sub`
- `mode`
- `time`
- `days`
- `target_window_days`
- `limit`
- `include_meta`

Behavior:

1. Validate request.
2. Resolve `scopeId`.
3. Load or create bundle.
4. Reset stale state for this subreddit.
5. Respect active cooldown.
6. Acquire an inflight lease for this subreddit.
7. Resolve fetch context:
   - OAuth if possible
   - otherwise public fallback if allowed
8. Optionally fetch subreddit metadata.
9. Fetch the next listing page from Reddit.
10. Normalize posts.
11. Filter by time window for `mode=new`.
12. Update persisted bundle:
   - posts
   - cursor
   - completion flags
   - cooldown/error state
13. Return updated summary and the advanced subreddit's result.

Responses are always shaped for orchestration, including soft failures.

Common response cases:

- `advanced: true`
- `advanced: false, cooldown_until: ...`
- `advanced: false, in_flight: true`
- `advanced: false, rate_limited: true, retryAfter: ...`
- `advanced: false, result.error: ...`

### Coverage bundle structure

Persisted bundle fields:

- `scopeId`
- `mode`
- `time`
- `days`
- `targetWindowDays`
- `createdAt`
- `updatedAt`
- `subreddits`
- `postsBySubreddit`

Each coverage state entry contains:

- `subreddit`
- `status`
  - `idle`
  - `active`
  - `complete`
  - `cooldown`
  - `timeout`
  - `error`
- `next_after`
- `cooldown_until`
- `covered_through_utc`
- `page_count`
- `post_count`
- `last_fetch_at`
- `last_error`
- `complete_1d`
- `complete_3d`
- `complete_5d`
- `inflight_until`
- `inflight_token`
- `meta`

### Coverage bundle storage

Primary file:

- `lib/repos/reddit-coverage.js`

Storage details:

- key prefix: `reddit-coverage:`
- default TTL: `24h`
- freshness window: `5m`
- uses compare-and-swap updates when available

Stale coverage can be reset automatically if:

- it is older than freshness threshold
- not in cooldown
- not in inflight lease

## Lower-Level Live Fetch API: `GET /api/reddit`

Primary file:

- `lib/api-handlers/reddit.js`

### Purpose

This is the lower-level normalized fetch API.

Current role:

- server fallback for snapshot fetches
- direct fetch route for callers that want normalized Reddit results without the snapshot wrapper

### Query parameters

- `subs`
- `mode`
- `time`
- `days`
- `limit`
- `max_pages`
- `fresh` or `force_refresh`

### Request shaping

The handler caps request shape based on subreddit count:

- `limit` reduced for larger requests
- `max_pages` reduced as subreddit count grows

The response exposes whether capping happened:

- `request_capped: true|false`
- `X-RDD-Request-Capped: 1` header

### `mode=new`

For `mode=new`, `GET /api/reddit` performs the live normalized fetch directly.

With current defaults, persisted coverage is disabled, so `mode=new` usually goes directly through live fetch.

### Non-coverage direct fetch path

If materialization is not used or fails, the handler:

1. Builds a time budget.
2. Resolves Reddit auth context.
3. Creates a Reddit fetcher.
4. Fetches subreddit metadata when allowed.
5. Fetches listing pages for each subreddit.
6. Applies concurrency control and inter-task delays.
7. Normalizes response payload.
8. Surfaces rate limits, timeouts, and request metrics.

### Live fetch response

Top-level fields:

- `mode`
- `time`
- `days`
- `limit`
- `max_pages`
- `fetch_all_pages`
- `auth_mode`
- `results`
- `fetched_at`
- `request_capped`
- `rate_limited`
- `rate_limited_subreddits`
- `retry_after_seconds`
- `timed_out`
- `timed_out_subreddits`
- `metrics`

### Live fetch headers

- `Cache-Control`
- `X-Rate-Limited`
- `Retry-After`
- `X-RDD-Request-Capped`
- `X-RDD-Timed-Out`
- `X-RDD-Metrics`

## Reddit Auth Model

Primary files:

- `lib/services/reddit-auth.js`
- `lib/services/reddit-fetch.js`

### OAuth-first behavior

The server prefers OAuth fetches:

- access token is read from signed cookie
- if missing, refresh token is used to obtain a new access token
- refreshed access token is written back as signed cookie

### Public fallback

If OAuth is unavailable and public fallback is allowed:

- server fetches from `https://www.reddit.com`

If OAuth is available:

- server fetches from `https://oauth.reddit.com`

### Token refresh

Token refresh uses:

- `REDDIT_CLIENT_ID`
- `REDDIT_CLIENT_SECRET`
- `refresh` cookie

Token refresh endpoint:

- `https://www.reddit.com/api/v1/access_token`

### Authentication outcomes

Possible auth modes:

- `oauth`
- `public`

Browser behavior:

- authenticated fetches sync to workspace snapshot
- public fetches do not perform authenticated workspace snapshot sync

## Reddit Upstream Fetcher

Primary file:

- `lib/services/reddit-fetch.js`

### Features

- request timeout handling
- retry with backoff
- OAuth URL normalization
- public URL normalization
- token refresh on `401`
- rate-limit detection on:
  - `429`
  - `403`
  - HTML or `Too Many Requests` bodies
- JSON normalization

### Important upstream behaviors

`createRedditFetcher()`:

- retries normal transient failures
- stops retrying aggressively on rate-limit errors
- attaches:
  - `User-Agent`
  - `Authorization: Bearer ...` when OAuth

### Time-budget behavior

The fetch stack uses a route-level time budget.

It prevents requests from running until function timeout and then dying abruptly.

Time budget inputs:

- `API_MAX_RUNTIME_MS`
- `VERCEL_TIMEOUT_MS`
- `API_TIMEOUT_BUFFER_MS`

## Rate-Limit State

Primary file:

- `lib/rate-limit-store.js`

Shared cooldown key:

- `reddit:upstream-cooldown`

Storage backend:

- Redis if `REDIS_URL` is configured
- otherwise in-memory fallback

Used for:

- sharing Reddit cooldown across requests
- preventing repeated immediate upstream retries after one request is rate limited

## Post-Fetch Workspace Sync

Primary files:

- `public/app-workspace.js`
- `lib/api-v1/handlers/snapshot.js`

When workspace fetch sync is enabled and a browser fetch is authenticated:

1. Browser ensures workspace exists with `POST /api/workspaces`.
2. Browser sends `PUT /api/workspaces/:workspaceId/snapshot`.

Current default:

- browser fetch does not sync large fetched post payloads back to the workspace automatically

### `POST /api/workspaces`

Purpose:

- resolve or create a workspace for the current browser sync token

Browser sends:

```json
{ "token": "sync_..." }
```

### `PUT /api/workspaces/:workspaceId/snapshot`

Purpose:

- persist the latest fetched dashboard snapshot and settings into workspace storage

Body fields:

- `token`
- `posts`
- `settings`
- `filters`
- `timestamp`
- optional `source`

Important behavior:

- payload size is limited
- source-backed sync is supported
- if `source.type === "reddit_coverage"`, the server can materialize posts from persisted coverage bundle instead of requiring all posts inline

The browser currently sends either:

- explicit `posts`, or
- a `source` object referring to a coverage scope

### Why workspace sync matters

This is not required to render the current fetch result in the browser.

It exists so server-side workspace APIs can later read:

- latest snapshot
- config
- analysis state

## Fetch Result Lifecycle In The Browser

After snapshot response returns:

1. UI stores grouped posts by subreddit.
2. UI stores snapshot metadata.
3. UI updates fetch summary chips and status text.
4. UI sets cooldown pause if rate limited.
5. UI keeps the latest dataset in browser storage.
6. UI optionally syncs workspace snapshot when server fetch sync is enabled.
6. UI runs AI ranking.
7. UI may emit notifications on auto-refresh.

This means fetching and ranking are separate stages:

- fetch gets normalized posts into the dashboard
- ranking analyzes those posts afterward

## Current Canonical Contract

If you are implementing or debugging the current product, assume this contract:

- frontend fetches via `GET /api/reddit/snapshot`
- server owns checkpoint/cooldown/cache orchestration
- coverage APIs are internal building blocks
- `GET /api/reddit` is fallback and lower-level access
- workspace snapshot sync is optional and is not required for the current browser dataset to survive reload/reopen

## Operational Notes

### Force refresh

Force refresh does two things:

- adds a cache-busting timestamp in the browser
- forwards `fresh=1` to the lower-level handler stack

In browser snapshot calls, force refresh appears as:

- `fresh=1`
- `_ts=<timestamp>`

### Caching summary

There are multiple layers of caching/state:

1. Browser local storage
   - latest fetched dataset
   - last fetched timestamp
   - snapshot info
2. Coverage bundle
   - key prefix: `reddit-coverage:`
   - checkpoint state and posts
3. Subreddit metadata cache
   - in-memory
4. Shared upstream cooldown
   - key: `reddit:upstream-cooldown`

### Typical failure classes

- `401`: user not authenticated and public fallback not allowed
- `429`: route/app throttle
- soft `200` with `rate_limited: true`
- soft `200` with `timed_out: true`
- `500`: snapshot handler or lower-level fetch failure

The system intentionally uses soft failures in several places so partial coverage state is preserved and returned instead of discarding all progress.

## Relevant Files

Browser:

- `public/app.js`
- `public/app-refresh.js`
- `public/app-fetch.js`
- `public/app-workspace.js`

Canonical browser API:

- `lib/api-handlers/reddit/snapshot.js`

Internal coverage stack:

- `lib/api-handlers/reddit/coverage.js`
- `lib/repos/reddit-coverage.js`

Lower-level live fetch stack:

- `lib/api-handlers/reddit.js`
- `lib/services/reddit-handler-invoke.js`
- `lib/services/reddit-fetch.js`
- `lib/services/reddit-auth.js`

Shared cooldown storage:

- `lib/rate-limit-store.js`

Post-fetch workspace persistence:

- `lib/api-v1/handlers/snapshot.js`
