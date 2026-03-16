# Amber Signal — Design Principles

## What This Tool Does

Users monitor Reddit for business opportunities: leads, customer signals, brand mentions, research. They configure a goal, fetch posts across subreddits, and let the AI rank what's worth acting on.

The core user loop:

1. **Fetch** — pull fresh posts from configured subreddits
2. **Rank** — AI scores posts against the user's goal
3. **Scan** — eye traverses the list, picks out what matters
4. **Triage** — open a post, read the AI analysis, decide
5. **Act** — reply, DM, save, research, or discard

Everything in the interface exists to make this loop faster and more confident. If a design element doesn't help the user complete one of these steps, it shouldn't be there.

---

## The One Job of Each Region

**Post list (center)** — fast scanning. The user should be able to determine "should I open this?" without clicking. The card must answer: what is it, how big is it, why does it matter, and who posted it — all without opening. Anything that doesn't help answer one of those four questions is clutter.

**Detail pane (right)** — confident decision. Once a post is selected, the user needs: what is this about, why is it relevant, and what should I do? In that order. The AI output (opportunity type, recommended action, explanation) is the content — not supporting metadata.

**Sidebar (left)** — workspace navigation. The user knows where they are. The sidebar should be available but not competing. It's chrome, not content.

**AI status bar** — system awareness. The user should always know: is the AI running, what's the current goal, how many results came back. Never hidden. Never verbose.

**Settings modal** — configuration, not daily use. Complexity is acceptable here because the user is in setup mode, not triage mode.

---

## Information Hierarchy (Post List)

Posts are tiered by the AI. The visual treatment must make tiers legible at a glance — not through labels, but through the card itself.

| Tier | Condition | Visual |
|------|-----------|--------|
| Hero | Priority ≥ 85% or relevance 5/5 | Amber left border (3px, full) + warm tint |
| Feature | Priority ≥ 65% or relevance ≥ 4/5 | Amber left border (50% opacity) |
| Standard | Mid-range scores | No left border treatment |
| Suppressed | Low/no relevance | No special treatment — full opacity, no border |

The score badge reinforces the tier — it is not the primary signal. The primary signal is the left border and background tint. If the user has to read the badge to know the tier, the visual treatment has failed.

Score badge format: `87%` for priority scores, `4/5` for relevance scores. Never raw decimals. Never `P87` — that requires the user to decode the prefix.

**Card anatomy** — each post card has three rows:

1. **Title row** — post title (up to 2 lines) + action badge (Reply now / DM / Save) + opportunity type badge + score badge. Title takes flex priority; badges are `shrink-0` and never push the title below one line.
2. **Metadata row** — two clusters separated by a dot: (a) context cluster: `r/subreddit`, flair pill, domain or `text` label; (b) stats cluster: timestamp, upvote count, comment count, controversy signal, author. Context is muted (zinc-400/500). Stats are prominent (zinc-800/100, semibold, JetBrains Mono).
3. **Rationale row** — AI explanation of why this post surfaced. Only shown when genuine AI text exists (opportunity summary or matched reason). Never the raw stats fallback — those are already in the metadata row.

**The rationale row** is the most important text in a post card. It answers "why did this surface?" without requiring the user to open the post. Keep it. Protect it. Never truncate it before the title.

**Internal pipeline signals do not belong on cards.** Review status (light review, model fallback, heuristic-only) is system health information — it tells the developer something, not the user. It belongs in the detail pane or debug tooling, not in a triage list where it competes for attention with decision-relevant signals.

---

## Detail Pane: Decision Pipeline

The right pane is ordered by decision urgency, not by data availability:

1. **Recommended action** — what to do (reply now, DM, save, research, ignore)
2. **Next step** — plain English instruction based on action + score
3. **Opportunity type** — classification of what this post is
4. **Summary** — AI explanation in 1–2 sentences
5. **Why now** — bullets explaining time-sensitivity or signal strength
6. **Scores** — priority, conversion likelihood, reply likelihood (secondary)
7. **Signals** — individual scored dimensions (tertiary, can stay collapsed)
8. **Momentum** — velocity data (upvotes/h, comments/h)

If the user reads only items 1–3, they should be able to act with confidence. Items 4–8 exist for users who want to understand, not just act.

---

## State Visibility

The user must always know:

- **Data freshness** — when was this fetched? Timestamps matter. Stale data should be flagged visibly (orange warning, not hidden).
- **AI status** — is ranking running, done, idle, or errored? Status dot + one-line summary in the bar above the list.
- **Fetch progress** — for large workspace fetches, show how many subreddits have loaded. A progress indicator isn't optional — without it the user doesn't know if the list is complete.
- **Rate limits** — when Reddit is throttling, say so plainly. Don't silently pause without explanation.

When the system is doing work in the background, the interface should acknowledge it. When the system errors, the error should be visible, specific, and actionable — not a generic toast.

---

## Cognitive Load

Show less, mean more.

- The post list shows: title, action badge, score badge, flair, domain/type, timestamp, upvote count, comment count, controversy ratio (when < 70%), author, rationale. Nothing else at rest.
- AI reasoning (per-post signal details) is off by default. Toggle-to-reveal for users who want to audit.
- Scores appear as formatted badges, not raw decimals. `87%` or `4/5`, not `0.873` or `P87`.
- Settings are collapsed by default (advanced options, model selection, prompt preview). Users configure once; they shouldn't see it on every session.
- Empty states should be informative: "No posts yet — hit Refresh to fetch" is better than silence. "AI hasn't ranked yet — run ranking to see scores" is better than missing columns.

---

## Typography

Four fonts. No substitutions.

| Role | Font | Notes |
|------|------|-------|
| Body / UI copy | Lato | 300 for muted/secondary, 400 body, 700 titles, 900 for display |
| Structural labels / section headers | Montserrat | 700–800 weight, all-caps, letter-spacing 0.12–0.18em |
| Data / numbers / scores | JetBrains Mono | 400–500 for values, 600 for emphasis |
| Post rationale / AI explanation | Lora | Italic only — editorial weight, signals editorial prose vs UI chrome |

Numbers are data. Scores, counts, timestamps, and rates always use JetBrains Mono. This makes them visually distinct from prose and scannable in dense lists.

Section labels: Montserrat, all-caps, tight tracking (0.18em), small (10px). They are wayfinding, not content. Color: `#8AA0BE` — recessive but legible.

Post rationale rows use Lora italic at 11.5px. The serif italic signals "this is an interpretation, not a fact" — it gives the AI's reasoning a distinct editorial voice separate from metadata and titles. This is intentional and load-bearing.

Lato weight hierarchy:
- `300` — timestamps, counts, secondary metadata (recessive)
- `400` — body prose, descriptions
- `700` — post titles, primary labels
- `900` — display text only (landing page, empty states)

---

## Color

Dark mode is the primary environment. Light mode uses a cool blue-gray palette — not warm paper, not stark white. The goal is a professional dashboard aesthetic from the 2014–2016 era: considered depth, not flat minimalism.

**Surface layers** (dark → light):

| Token | Dark | Light | Light hex |
|-------|------|-------|-----------|
| Page background | zinc-900 | cool blue-gray | `#E8EDF4` |
| Panel / sidebar | zinc-800 | deep navy | `#1A2332` |
| Sidebar header | — | darkest navy | `#141D2B` |
| Filter toolbar | zinc-900 | white | `#FFFFFF` |
| Post cards | zinc-800 | white (floating) | `#FFFFFF` |
| Selected card | zinc-700 | light blue tint | `#EBF4FF` |
| Overlay / modal | zinc-800 + backdrop | white + backdrop | — |

**Light mode depth system**: The page background has a layered radial gradient to create subtle atmospheric depth. Cards float above it with `box-shadow: 0 1px 3px rgba(16,30,54,0.08)`. On hover, cards elevate with stronger shadow + 1px translateY. This elevation system replaces flat row separators.

**Sidebar in light mode**: Deep navy `#1A2332`, not light. The sidebar is always dark — it is a control surface, not a content surface. An amber top border (3px) marks the brand and anchors the eye. Selected items get an amber-tinted background `rgba(217,119,6,0.14)`.

**Accent**: Amber only. `#D97706` (amber-600) for backgrounds and borders. `#FBBF24` (amber-400) for text on dark surfaces. `#F5B040` for selected sidebar items. Amber at full saturation is reserved for moments that must be noticed — hero tier borders, the primary CTA button, live AI status, selected nav. Everywhere else, use tinted amber (low opacity).

**Button treatment**:
- Primary action: flat solid amber `#D97706`, Lato 700, radius 5px — no gradient, no bevel, no glow
- Secondary action: dark slate `#2D3748`, radius 4px — recessive but readable
- No gradients on interactive elements in light mode

**Semantic colors** (do not repurpose):

- Emerald — success, confirmed action
- Orange — warning, stale data, caution (distinct from amber on purpose)
- Rose — error, danger, destructive action, controversy (upvote ratio < 70%)

**Borders in dark mode**: `white/7%` (`rgba(255,255,255,0.07)`). They suggest separation, they don't enforce it. Use Zinc colors only — no Stone variants.

**Timestamps and velocity**: amber when very recent (< 15 min) or spiking — recency is a decision factor. Velocity surfaces as a number, not just a signal: spiking posts show `⚡N/h` (rose, with the rate); rising posts (> 2 upvotes/h, not spiking) show `+N/h` in amber next to the score. The upvote icon is amber — it is a positive engagement signal and the accent color applies.

**Amber appears on secondary metadata only for recency and velocity.** Do not add amber to other metadata fields.

---

## Design Era: Retro-Futurist 2026

This app targets a specific aesthetic: what a 1985 designer would have built in 2026. Not nostalgia-driven kitsch, not clean modern SaaS — something with genuine analog character expressed through contemporary craft.

**The palette is a visible slate navy**, not near-black. `#152438` background, `#1C2F47` cards, `#0F1E32` sidebar. Dark enough to feel like a control room, light enough to feel like a professional tool, not a terminal.

**The amber is phosphor amber** (`#F5A623`), not burnt orange. Active states glow. The AI status dot pulses with a `box-shadow` glow. Hero card borders cast a lateral glow. Focused inputs have an amber aura. This is the CRT phosphor effect — a single accent color that feels alive.

**Amber color hierarchy:**
- `#F5A623` — primary phosphor (active states, selected items, glowing elements)
- `#FBBF24` — bright readable amber for text labels on dark
- `#D97706` — pressed state, background fills (buttons, badges)
- `#FCD34D` — score numbers (maximum contrast)

**Three analog texture layers (stacked):**
1. Film grain — SVG `feTurbulence` fractalNoise at 3.2% opacity, `z-index: 9998`
2. CRT scanlines — 1px dark line every 4px, `z-index: 9999`, both on the `html::after` pseudo-element
3. Depth gradients — radial-gradient atmospheric depth on the body background

**Typography stack (2025/2026 top-tier):**
| Role | Font | Notes |
|------|------|-------|
| Body / UI | Space Grotesk | Mechanical letterforms, analog warmth — not clinical |
| Structural labels | Unbounded | Wide geometric, 1970s instrument panel. Min 10px. |
| Data / numbers | JetBrains Mono | Terminal precision, tabular alignment |
| AI rationale | Lora italic | Editorial voice, distinct from UI chrome |

**Unbounded at small sizes:** minimum 10px. The typeface has wide, detailed letterforms that collapse below this threshold. Section labels use `font-size: 10px`, `letter-spacing: 0.16–0.18em`, `font-weight: 700`. At display sizes (h1, h2), counteract the built-in width with `letter-spacing: -0.02em` for h1 and `-0.01em` for h2.

**What makes it old-school:**
- No glassmorphism — solid surfaces only, no `backdrop-filter`
- No pill shapes — chips and badges are `border-radius: 4px`, not `rounded-full`
- No gradient fills on buttons — flat solid amber `#D97706`
- No animations on hover states beyond shadow lift and `translateY(-1px)`
- Card hover reveals a ghost amber inset bar (`box-shadow: inset 2px 0 0 rgba(245,166,35,0.18)`) — like a terminal row selection
- Sidebar brand always dark, always with 3px amber top stripe
- Scrollbars amber-tinted (`rgba(245,166,35,0.25)`)

**What it is not:**
- Not 2015 flat SaaS (Mixpanel, Segment era) — that was the previous direction
- Not Material Design
- Not modern 2022+ (no blur, no neons, no variable font animations)
- Not skeuomorphic

The mental model: a precision instrument built by people who grew up on amber terminals and now have access to the best type foundries in the world.

---

## Layout

Three fixed panes:

1. **Left sidebar** — narrow, fixed, workspace navigation
2. **Center** — scrollable post list, takes remaining width
3. **Right** — detail pane, fixed width, visibly elevated surface

The sidebar is always dark — `#1A2332` in light mode, zinc-900 in dark mode. It is a control surface, not a content surface, and it should read as such regardless of the app's color scheme. A single right border separates it from the post list. The detail pane is a lighter surface — it must read as distinct from the list without a hard border between them.

The filter toolbar sits above the post list, below the AI status bar. Search is always visible. Additional filters (subreddit, score, time range) are behind a "Filter" drawer — they're used occasionally, not constantly.

---

## Motion

Animate transitions that carry meaning. Suppress everything else.

**Animate:**
- Panel load: fade up from 8px below, 400ms ease-out, 60ms stagger between list items
- AI status transitions (idle → ranking → done)
- Score bar fill on mount: 600ms ease-out

**Don't animate:**
- Individual row hover states
- Filter chips and repeated small elements
- Anything that fires more than a few times per normal use session

Loading states: skeleton shimmer for content areas, not spinners. Status dots pulse at a calm 2s rhythm — not urgently.

---

## AI Module

**Status bar** — single compact row above the post list. Always visible. Shows:
- Status dot: amber solid (active), amber pulsing (ranking), zinc-600 (off)
- Active goal, truncated
- Score count + strong match count
- Quick actions: rerank, edit goal, toggle reasons

**Settings order** (fixed, never reorder):
1. Enable toggle
2. Goal (preset chips → textarea)
3. Tuning options (collapsible)
4. Model + API key (collapsible)
5. Prompt preview (hidden by default)
6. Status banners (error first, then stale warning)
7. Run ranking — full-width amber button, always last

---

## What to Cut

If a design element doesn't help the user scan faster, triage more confidently, or understand system state — remove it.

- Decorative borders and dividers that don't indicate structure
- Metadata that doesn't influence a decision (raw API fields, internal IDs)
- Internal pipeline quality signals in the post list (AI review status, model fallback labels, heuristic-only flags) — these are system health, not user decisions; they belong in the detail pane or debug tooling
- Animations on elements that repeat frequently
- Settings visible in daily use that are only relevant during setup
- Color used for visual interest rather than meaning
