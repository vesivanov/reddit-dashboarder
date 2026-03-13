# Reddit Coverage Plan

## Goal

Support up to `50` subreddits with reliable coverage for:

- full last `24h`
- resumable coverage for last `3d`
- eventual / resumable coverage for last `5d`

without depending on one long browser-driven live fetch.

## Current Problem

The current product still depends too much on live Reddit requests during a user session.

That causes:

- Reddit OAuth `429` even when authenticated
- long waits for large runs
- partial completion on one blocked subreddit
- unstable workspace-sidecar behavior coupled to fetch completion

The root issue is not only pacing. The root issue is missing persistent crawl state.

## Target Model

Move from "fetch everything now" to "maintain stored coverage incrementally".

The browser should:

- read stored coverage immediately
- trigger incremental advancement
- show freshness / backlog / progress

The backend should:

- persist per-subreddit crawl state
- persist fetched posts
- advance one small crawl step at a time
- resume from checkpoints after rate limits or timeouts

## Core Design

### 1. Persistent Crawl State

Store one record per subreddit / query shape:

- `subreddit`
- `mode`
- `time`
- `days`
- `target_window_days`
- `status`
- `next_after`
- `last_fetch_at`
- `cooldown_until`
- `covered_through_utc`
- `page_count`
- `post_count`
- `last_error`

For the current product, the important tracked window is:

- `1d` freshness coverage
- `3d` medium-horizon coverage
- `5d` backfill coverage

### 2. Persistent Post Cache

Store normalized Reddit posts keyed by:

- `subreddit`
- `post id`

Fields:

- normalized post payload
- `fetched_at`
- `created_utc`
- `window_tags`

This allows dedupe and fast UI reads.

### 3. Small Crawl Step Endpoint

Add an endpoint that advances exactly one subreddit by one page.

Properties:

- one subreddit only
- one listing page only
- stores progress after every step
- returns quickly
- respects subreddit cooldown

This is the unit of work that fits Reddit + Vercel constraints.

### 4. Coverage Read Endpoint

Add an endpoint that returns:

- cached posts for requested subreddits
- per-subreddit coverage state
- freshness / backlog metrics
- whether each subreddit is fully covered to target window

The UI should render from this endpoint first.

### 5. Browser Coordinator

For large runs, the browser should:

- request cached coverage first
- identify subreddits missing coverage
- advance them one step at a time
- rotate across subreddits breadth-first
- stop when target coverage is complete or cooldown is active

This keeps progress durable while avoiding long-lived server work.

## Product Behavior

### Freshness Lane

Primary goal:

- keep last `24h` complete across up to `50` subreddits

Behavior:

- fetch newest page first
- stop once last-24h coverage is complete
- run frequently

### Backfill Lane

Secondary goal:

- extend coverage toward `5d`

Behavior:

- resume from stored cursor
- advance slowly behind freshness work
- persist progress every page

### UX

The user should see:

- posts already covered
- `x/50` subreddits fresh for `24h`
- `y/50` subreddits covered for `3d`
- `y/50` subreddits covered for `5d`
- cooldown / retry state when Reddit throttles

The user should not wait for one full crawl to finish before seeing results.

## Implementation Phases

### Phase 1: Persistence Foundation

- add crawl-state storage helpers
- add cached-post storage helpers
- define key format and TTL / retention behavior

### Phase 2: Stepwise Crawl API

- add `GET /api/reddit/coverage`
- add `POST /api/reddit/advance`
- implement one-page advancement
- persist posts + checkpoint after each successful page

### Phase 3: Frontend Read + Advance Flow

- large fetches read coverage instead of live crawling first
- client advances missing subreddits stepwise
- render progress from persistent state
- disable sidecar sync during large crawl runs

### Phase 4: Coverage Logic

- freshness complete check for `1d`
- resumable backfill toward `5d`
- cooldown handling per subreddit
- dedupe and stop conditions

### Phase 5: Hardening

- tests for checkpoint resume
- tests for rate-limited subreddit recovery
- tests for `50` subreddit cap
- optional cron / worker integration later

## Key Decisions

### What We Optimize For

- reliability over immediate completeness in one request
- durable partial progress
- visible coverage state
- eventual completion under Reddit limits

### What We Stop Doing

- full 1-5 day live fetch inside one browser flow
- long-running polling endpoints that keep growing response payloads
- large post-sync side effects after every crawl

## Acceptance Criteria

### Functional

- user can configure up to `50` subreddits
- app shows cached posts immediately if available
- app can resume unfinished coverage after refresh
- app tracks whether each subreddit is covered for `1d`, `3d`, and `5d`

### Reliability

- one Reddit `429` does not discard progress
- restarting the page does not restart from zero
- crawl state survives across requests

### UX

- large runs no longer require one uninterrupted 10-15 minute session
- user sees clear progress by subreddit and target window

## Immediate Build Order

1. Add crawl-state repository.
2. Add cached-post repository.
3. Add `coverage` read endpoint.
4. Add `advance` one-page endpoint.
5. Switch large-fetch UI to read coverage + advance incrementally.
6. Disable large-run sync sidecars until crawl is complete.
