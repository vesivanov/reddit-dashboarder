# Amber Signal — Design Brief

## Identity

**Product name**: Amber Signal
**What it does**: Scans noise, surfaces signal.
**Who it's for**: People who need to act on information, not admire it.

The interface should disappear when the work is obvious and command attention when something matters. Dense, dark, warm. A cockpit — not a marketing dashboard.

---

## Aesthetic Direction

Think: night-vision scope. Reuters terminal. Advanced reconnaissance software.

The product has one visual job: make relevance legible instantly. Low-signal content should recede. High-signal content should ignite. The eye should be able to traverse the interface in a single scan and land exactly where action is required.

**What this product is not:**
- A blue SaaS app with purple gradients
- A whitespace-maximalist marketing page
- Generic "AI startup" aesthetic — friendly, rounded, pastel, forgettable

**Why amber**: Amber is the color of signal, warning, attention, treasure. It reads as both technical precision (oscilloscopes, status lights) and value (gold standard, signal found). It is warm against dark surfaces — less institutional than sky blue, more visceral. Every competitor uses blue. We don't.

---

## Typography

Three fonts. No exceptions, no substitutions.

| Role | Font |
|------|------|
| Body / UI copy | Plus Jakarta Sans |
| Display / Structural headers | Syne |
| Data / Numbers / Metrics | JetBrains Mono |

**Philosophy:**
- Plus Jakarta Sans handles the interface. It's legible at density, neutral enough to not compete with content.
- Syne is structural and slightly alien — right for section titles and modal headers that need to feel authoritative, not decorative.
- JetBrains Mono is for anything that is a value: scores, counts, timestamps, API keys. Numbers and data must be visually distinct from prose. Always tabular, always monospaced.

**Rules:**
- No serif. No italic. Not now, not ever.
- Everything the user reads is a number or it isn't — treat them differently
- Section labels: all-caps, tracked out, small, structural (labels are wayfinding, not content)
- Titles should feel precise, not heavy — use semibold over bold

---

## Color

### The two jobs of this palette

**Recession**: Most surfaces should demand nothing. Dark, warm, near-black. The palette's default state is quiet.

**Ignition**: Amber fires when something is worth acting on. It should feel rare enough to carry urgency — never decorative, never wallpaper.

### Dark mode is canonical

The primary experience is dark. Dark mode is not an afterthought or an accessibility option — it is the intended environment. Design dark first.

Light mode exists for daytime use and user preference. It inherits the same hierarchy and warmth — off-white surfaces, not clinical white.

### Surface hierarchy

Surfaces are layered to create depth without shadow. From outermost to most elevated:

1. **Page background** — the darkest layer, recedes completely
2. **Panel / detail surface** — visibly lighter, draws the eye
3. **Raised / input surface** — interactive elements sit above panels
4. **Overlay** — modals and dropdowns float above everything

The separation between layers should be subtle enough to feel atmospheric, not striped.

### Accent

Amber is the sole accent. It appears in:
- Active states and selected items
- High-relevance signals and scores
- Primary call-to-action buttons
- The AI module's live status

Amber at full saturation is loud. Use it deliberately. Prefer soft amber tints (low opacity, desaturated) for backgrounds and selected states — save full amber for moments that must be noticed.

### Semantic colors

These carry universal meaning and should not be repurposed:

- **Emerald** — success, high score, confirmed action
- **Orange** — warning, stale data, caution (orange, not amber — it must contrast from the accent)
- **Rose** — error, danger, destructive action

Warnings use orange specifically to avoid visual collision with the amber accent. If warnings used amber, the accent would lose its urgency.

### Borders

Dark mode borders are glass-like whispers, not hard dividers. They suggest separation rather than enforce it. When a border competes visually with content, it has failed.

---

## Motion

Animate high-impact moments. Suppress everything else.

**What to animate:**
- Page-level panel entrances (fade up from slightly below)
- List items staggered on load — not all at once, but in a brief cascade
- Status transitions in the AI module (active, ranking, idle)

**What not to animate:**
- Individual list item hovers (too frequent — creates fatigue)
- Filter chips and small repeated elements
- Anything that fires more than a few times per second of normal use

**High-relevance post glow**: Posts with a score of 5 or marked high-priority by the AI engine render a warm amber left-bar and ambient glow. This is the interface's highest-stakes visual signal — it should feel like the item is illuminated, not just styled.

**Loading states**: Skeleton shimmer for content areas, not spinners. Status dots pulse at a calm 2s rhythm — not urgently.

---

## Density

Two density modes. One per region.

**Comfortable** — used for reading, detail views, modals, onboarding. Generous padding. Content should breathe.

**Compact** — used for the post list, sidebar, filter bars. Tight rows. The user is scanning, not reading. Optimize for information per viewport-height.

Never mix densities within the same region. The sidebar and post list are always compact. The detail pane and modals are always comfortable.

---

## Layout

### Three-pane application

The dashboard is a fixed three-pane layout:
1. **Left sidebar** — workspace navigation, narrow and fixed
2. **Center** — post list, scrollable, takes remaining width
3. **Right** — post detail pane, fixed width, lighter surface

The sidebar and page background share the same surface in dark mode. No visual separation needed — a single border-right is enough. The detail pane should read as distinctly elevated: a visibly lighter surface, clearly distinct from the list behind it.

### Sidebar

The sidebar is navigation, not content. It should feel like the chrome of the application — present but not competing. Selected workspace items use a soft amber tint with a left-border accent. Unselected items are low-contrast zinc.

### Scrollbar

Even the scrollbar should be on-brand. Amber-toned thumb — subtle, warm, present when needed. Not chrome gray.

---

## AI Module

### Status bar

A single compact row above the post list — never a card, never a panel. It communicates:
- Current AI status (off, active, ranking)
- The active goal (truncated if long)
- Score count and strong-match count
- Quick actions (rerank, edit goal, toggle reasons)

Status is communicated through a dot: amber solid when active, amber pulsing when ranking, zinc-600 when off. The dot is the first thing the eye should find.

### Settings

The AI settings section has a fixed order that should never change:
1. Section header + enable toggle
2. Goal — preset chips collapsing to a textarea
3. Tuning options (collapsible by default)
4. Model and API key (collapsible by default)
5. Prompt preview (hidden by default, toggle-to-reveal)
6. Status banners — error first, then stale warning
7. Run ranking — full-width primary amber button, always last

The ranking button should feel conclusive. It ends the configuration and begins the computation.

---

## Landing Page

Dark-only. No light mode on the landing. The landing page is a first impression — it should feel like entering a monitoring room, not landing on a SaaS homepage.

The amber signal theme should be literal: a top-bar amber gradient bleeds from the left edge and fades to transparent, as though the interface is receiving something. The hero has a subtle upward amber glow from below the fold — warmth rising from the content, not a spotlight from above.

---

## What this system does not include

- Stone color scale (zinc only)
- Violet, purple, or indigo in any role
- Italic typography
- Serif fonts
- Light mode on the landing page
- Heavy drop shadows inside the dashboard (shadows only on modals and floating overlays)
- Blue as any accent or action color
