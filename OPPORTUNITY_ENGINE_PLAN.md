# Commercial Opportunity Intelligence Engine

## Product Direction

The product direction is no longer "AI relevance scoring for Reddit posts."

The new direction is:

- detect commercially useful conversations across Reddit
- classify the kind of opportunity each conversation represents
- rank those opportunities for action
- recommend what the user should do next

This keeps sales and marketing at the center without reducing the system to lead scoring alone.

## Core Product Goal

Help a user decide, quickly and consistently:

1. What kind of opportunity is this thread?
2. Is it worth attention now?
3. What should I do with it?

## Problem With The Old Model

The old ranking model collapses several different jobs into one score:

- candidate generation
- relevance estimation
- action prioritization
- explanation

That creates unstable behavior, duplicated logic, and weak product semantics.

Examples in the current code:

- client-side heuristic prefiltering and score calibration
- server-side LLM scoring with a generic `0-5` relevance scale
- separate hot-lead thresholds and action logic in another service
- lingering score-first semantics in parts of the dashboard UI

## New Conceptual Model

The app should operate as a commercial opportunity intelligence engine.

The engine should produce, for each post:

- `opportunityType`
- `priorityScore`
- `recommendedAction`
- `confidence`
- `summaryReason`
- structured supporting signals

The frontend should expose an opportunity feed, not a raw AI score feed.

## Scope

This product is still strongly sales and marketing oriented, but it should not be restricted to "lead finding."

The system should support at least these commercial opportunity classes:

- lead
- pain_point
- buying_intent
- tool_search
- competitor_mention
- objection
- content_opportunity
- partnership_opportunity
- reputation_risk
- noise

V1 should be narrower.

## Lean V1 Taxonomy

To avoid overengineering, initial implementation should ship with:

- `lead`
- `pain_point`
- `tool_search`
- `competitor_mention`
- `content_opportunity`
- `noise`

## Core Decision Questions

Every analyzed post should answer:

1. `What is this?`
2. `Why does it matter?`
3. `What should the user do next?`

## Opportunity Record

Canonical server-owned record:

```json
{
  "postId": "abc123",
  "classification": {
    "type": "lead",
    "confidence": 0.84
  },
  "signals": {
    "commercialIntent": 0.87,
    "serviceFit": 0.91,
    "buyerSignal": 0.74,
    "urgency": 0.68,
    "replyability": 0.86,
    "researchValue": 0.33,
    "authorityFit": 0.71,
    "risk": 0.12,
    "freshness": 0.82,
    "momentum": 0.56
  },
  "scores": {
    "replyLikelihood": 0.79,
    "clientConversionLikelihood": 0.73,
    "priority": 0.77
  },
  "action": {
    "recommended": "reply_now",
    "reason": "Business owner describing an urgent acquisition problem with clear service fit."
  },
  "explanation": {
    "summary": "Likely lead with clear pain and a credible public-reply opening.",
    "bullets": [
      "strong commercial intent",
      "recent, still actionable",
      "high service fit"
    ]
  }
}
```

## User-Facing Views

The product should support opportunity-focused views rather than generic score views.

Primary views:

- `Act Now`
- `Watch`
- `Research`

Later, these can map to:

- Sales
- Research
- Content
- Monitor

## Recommended Actions

Initial actions:

- `reply_now`
- `dm_if_possible`
- `save_for_followup`
- `research`
- `ignore`

The system should eventually recommend an action, not just produce a score.

## Ranking Targets

The product should support more than one target.

Initial targets:

- `replyLikelihood`
- `clientConversionLikelihood`
- `priority`

`priority` should be a deterministic combination of the other dimensions plus freshness and momentum.

## 80/20 Architecture

The 80/20 architecture is:

1. broad candidate retrieval
2. structured LLM feature extraction
3. deterministic server-side ranking
4. optional rerank on top-N only

This is the best practical tradeoff without training a custom model.

## Retrieval Strategy

Retrieval should optimize for recall, not final precision.

Inputs:

- selected subreddits
- freshness window
- keyword and phrase heuristics
- velocity and engagement
- later: semantic similarity

Retrieval should answer:

- should this post be analyzed more deeply?

Retrieval should not be the main source of final business judgment.

## Structured AI Extraction

The LLM should return explicit dimensions rather than only one score.

Initial dimensions:

- `commercialIntent`
- `serviceFit`
- `buyerSignal`
- `urgency`
- `replyability`
- `researchValue`
- `authorityFit`
- `risk`
- `opportunityType`
- `recommendedAction`
- `reason`

Bridge requirement:

- preserve compatibility with legacy `aiRelevance` until the frontend fully migrates

## Deterministic Rankers

The rankers should be server-owned and deterministic.

Suggested formulas:

```text
replyLikelihood =
0.35 * replyability +
0.20 * urgency +
0.15 * freshness +
0.15 * momentum +
0.15 * serviceFit -
0.20 * risk
```

```text
clientConversionLikelihood =
0.35 * commercialIntent +
0.25 * serviceFit +
0.15 * buyerSignal +
0.15 * authorityFit +
0.10 * urgency -
0.15 * risk
```

```text
priority =
0.45 * clientConversionLikelihood +
0.30 * replyLikelihood +
0.15 * freshness +
0.10 * momentum
```

These formulas should be configurable later, but hard-coded first.

## Frontend Exposure

The frontend should display:

- opportunity type
- recommended action
- summary reason
- priority indicator

The frontend should not lead with raw opaque AI scores.

Detailed signal breakdown should be visible under an expandable "Why?" area.

## Settings Model

Settings should be split into product-level strategy settings and advanced AI settings.

### Product-Level Settings

- offering
- ideal customer
- problems solved
- avoid criteria
- preferred engagement style
- opportunity types to prioritize
- strategy preset
- freshness window
- strictness

### Advanced AI Settings

- OpenRouter API key
- model
- rerank top N toggle
- max posts to analyze
- debug/explanation mode

Users should configure business intent, not prompt internals.

## API Direction

The backend should eventually expose opportunity-native responses.

Bridge response shape:

- keep `scores` and `metadata` for existing consumers
- add `opportunities` keyed by `postId`

Future response shape:

```json
{
  "items": [
    {
      "post": {},
      "classification": {},
      "signals": {},
      "scores": {},
      "action": {},
      "explanation": {}
    }
  ]
}
```

## Rollout Plan

### Phase 1

- document the new product direction
- introduce shared opportunity-engine primitives on the backend
- extend AI ranking responses with structured opportunity payloads
- preserve compatibility with legacy `aiRelevance`

### Phase 2

- migrate poller and hot-lead logic to server-owned opportunity scores
- stop using UI-side score calibration
- expose opportunity-aware objects in the dashboard state

### Phase 3

- replace "AI relevance" UI with opportunity feed UI
- add strategy presets and opportunity settings
- add recommended action and "Why?" drawer

### Phase 4

- add optional top-N comparative reranking
- add lightweight feedback capture
- tune deterministic weights using real outcomes

## Initial Implementation Tasks

1. Add `lib/services/opportunity-engine.js`
2. Define shared taxonomy, score normalization, and deterministic rank formulas
3. Extend `lib/services/ai-ranking.js` prompt and parser to support structured opportunity outputs
4. Extend `/api/reddit/ai-rank` to return `opportunities`
5. Thread opportunity data through the poller
6. Update frontend state to consume opportunity objects
7. Replace UI language from "AI relevance" to opportunity language
8. Add tests around structured parsing and deterministic scoring

## Constraints

- no custom model training
- keep OpenRouter compatibility
- preserve existing API behavior during migration
- prioritize practical implementation over a large framework rewrite

## What Success Looks Like

The system is successful when a user can open the app and quickly understand:

- which conversations matter
- what kind of opportunity each one is
- which thread to act on first
- why the engine made that recommendation

That is the north star for this redesign.
