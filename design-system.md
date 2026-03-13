# Reddit Dashboarder — Design System

## Identity

**Name**: Amber Signal
**Thesis**: A precision monitoring tool for people who need to act on information, not admire it. Dense, dark, warm. The interface should disappear when the work is obvious and command attention when something matters.

### Aesthetic Direction

The product scans noise and surfaces signal. The visual language should reflect that: near-black surfaces that recede, amber that ignites when relevance is high. Not a marketing dashboard — a cockpit.

Think: night-vision scope, Reuters terminal, advanced reconnaissance software. Precision over decoration. Every element justifies its presence.

**What this product is NOT:**
- A blue SaaS app with purple gradients
- A whitespace-maximalist marketing page
- Generic "AI startup" aesthetic

**The amber choice**: Amber (gold) is the color of signal, warning, attention, treasure. It reads as both technical precision (oscilloscopes, status lights) and value (gold standard, signal found). It is warm against dark surfaces — less institutional than sky blue, more visceral. The entire competitor category uses blue. We don't.

---

## Typography

Three fonts. No exceptions, no substitutions.

| Role | Font | Use |
|------|------|-----|
| Body / UI copy | `Plus Jakarta Sans` | All interface text, labels, descriptions, buttons |
| Display / Structural | `Syne` | Section headers, modal titles, nav labels, onboarding steps |
| Data / Code | `JetBrains Mono` | Scores, counts, metrics, timestamps, API keys, code |

**Load both via Google Fonts:**
```
family=Plus+Jakarta+Sans:wght@400;500;600;700
family=Syne:wght@500;600;700
family=JetBrains+Mono:wght@400;500
```

### Rules
- No serif. No italic. Not now, not ever.
- Numbers visible to the user: always `font-mono tabular-nums`
- Section labels: `font-syne font-semibold text-[10px] tracking-[0.16em] uppercase`
- Body at dense sizes: `text-sm` (0.875rem) is comfortable. `text-xs` is metadata-only.
- Titles should be `font-semibold` not `font-bold` — `Plus Jakarta Sans` bold reads heavy at UI scale

---

## Color System

### Philosophy
The palette has two jobs: recession and ignition. Most surfaces should recede into dark warmth, demanding nothing. Amber ignites when there's signal worth acting on. Emerald confirms success. Rose warns. Everything else is zinc.

### Surfaces

**Dark mode (canonical — primary experience):**

| Token | Value | Use |
|-------|-------|-----|
| `surface/page` | `#0D0D10` | App background, outermost container |
| `surface/panel` | `#18181D` | Main panels, detail pane, modals |
| `surface/sidebar` | `#0D0D10` | Left navigation (same as page, no visual separation needed) |
| `surface/raised` | `#242430` | Inputs, hover states, elevated cards |
| `surface/hover` | `#1F1F27` | List item hover, button hover bg |
| `surface/selected` | `rgba(217,119,6,0.12)` | Selected list items, active filters |
| `surface/overlay` | `rgba(0,0,0,0.55)` | Modal backdrops |

**Light mode:**

| Token | Value | Use |
|-------|-------|-----|
| `surface/page` | `#F2F0EB` | App background — warm off-white, not clinical zinc |
| `surface/panel` | `#FDFCFA` | Panels, modals — barely warm white |
| `surface/sidebar` | `#ECEAE3` | Left sidebar — warm cream, distinct from panel |
| `surface/raised` | `#E6E3DB` | Inputs, hover states |
| `surface/selected` | `#FFFBEB` | Selected items — amber-50 |

### Borders

Dark mode borders are glass-like whispers, not hard dividers:

| Token | Value |
|-------|-------|
| `border/default` (dark) | `rgba(255,255,255,0.07)` |
| `border/strong` (dark) | `rgba(255,255,255,0.12)` |
| `border/accent` | `rgba(217,119,6,0.45)` |
| `border/default` (light) | `rgba(0,0,0,0.07)` |
| `border/strong` (light) | `rgba(0,0,0,0.12)` |

In Tailwind classes, use `border-zinc-200 dark:border-white/[0.07]` for default borders.

### Text

| Token | Dark | Light |
|-------|------|-------|
| `text/primary` | `#F4F4F5` (zinc-100) | `#18181B` (zinc-900) |
| `text/secondary` | `#A1A1AA` (zinc-400) | `#52525B` (zinc-600) |
| `text/muted` | `#71717A` (zinc-500) | `#71717A` (zinc-500) |
| `text/data` | `#F4F4F5` with `font-mono` | `#18181B` with `font-mono` |

### Accent — Amber

The primary accent is `#D97706` (amber-600) in light mode and `#FBBF24` (amber-400) in dark mode.

| Token | Value | Use |
|-------|-------|-----|
| `accent/primary` (light) | `#B45309` | Button text, active labels |
| `accent/primary-bg` (light) | `#D97706` | Button backgrounds, strong borders |
| `accent/primary` (dark) | `#FBBF24` | Text, icons, active states |
| `accent/primary-bg` (dark) | `#D97706` | Button backgrounds |
| `accent/soft` (light) | `#FFFBEB` | Subtle bg (amber-50) |
| `accent/soft` (dark) | `rgba(217,119,6,0.12)` | Subtle bg, selected states |
| `accent/border` (light) | `rgba(217,119,6,0.5)` | Accent borders |
| `accent/border` (dark) | `rgba(217,119,6,0.35)` | Accent borders |
| `accent/glow` | `rgba(245,158,11,0.12)` | Background glow on high-relevance posts |

Tailwind classes to use:
- Buttons: `bg-amber-600 text-white hover:bg-amber-700 active:bg-amber-800`
- Text accent (light): `text-amber-700`
- Text accent (dark): `dark:text-amber-400`
- Soft bg (light): `bg-amber-50`
- Soft bg (dark): `dark:bg-amber-600/[0.12]`

### Semantic Colors

These remain unchanged — they carry universal meaning:

| Semantic | Use | Classes |
|----------|-----|---------|
| Success / High score | Emerald | `text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/50` |
| Warning / Stale | Orange (not amber — contrast from accent) | `text-orange-700 dark:text-orange-300 bg-orange-100 dark:bg-orange-900/40` |
| Danger / Error | Rose | `text-rose-600 dark:text-rose-300 bg-rose-100 dark:bg-rose-900/40` |

> **Note**: Warnings previously used amber. They now use `orange-*` classes to avoid collision with the amber accent. Update usages accordingly.

---

## Focus States

```
focus-visible:outline-none
focus-visible:ring-2
focus-visible:ring-amber-500
focus-visible:ring-offset-2
focus-visible:ring-offset-[#0D0D10] (dark)
focus-visible:ring-offset-[#F2F0EB] (light)
```

Inputs:
```
focus:outline-none
focus:ring-2
focus:ring-amber-500
focus:ring-offset-1
focus:border-transparent
```

---

## Motion

Animate high-impact moments. Suppress repetitive micro-interactions that create fatigue.

### Entrance
```css
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(16px); }
  to   { opacity: 1; transform: translateY(0); }
}
```
- Page-level panels: `fadeUp 0.4s cubic-bezier(0.22, 1, 0.36, 1)`
- List items: staggered, `animation-delay` increments of 35ms, max delay ~200ms

### Hover
- Color/bg transitions: `transition-colors duration-150`
- Lift (buttons, cards): `transition-transform duration-150 hover:-translate-y-px`
- No transform on frequent repeated elements (list items, filter chips)

### Loading
- Skeleton shimmer preferred over spinners for content areas
- Status dots: `animate-pulse` with `animation-duration: 2s`

### Glow (high-relevance posts)
Posts with score 5 or `opportunity.priority === 'high'` render a warm amber presence:
```
box-shadow: inset 3px 0 0 #D97706, 0 0 28px rgba(245,158,11,0.07)
```
The left-bar accent becomes amber instead of emerald when the AI is active.

---

## Density

One density mode per surface region. Comfortable for reading, compact for scanning.

**Comfortable** (post detail, modals, onboarding):
- List rows: `px-4 py-3`
- Panels: `p-5`
- Toolbars: `px-4 py-2.5`

**Compact** (post list, sidebar, filters):
- List rows: `px-3 py-2.5`
- Toolbars: `px-3 py-2`
- Panels: `p-3`

---

## Component Recipes

### Buttons

Base:
```
inline-flex items-center justify-center gap-2 rounded-lg
text-sm font-medium leading-5 transition-colors duration-150
disabled:opacity-40 disabled:cursor-not-allowed
focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500
```

Variants:
- **primary**: `bg-amber-600 text-white hover:bg-amber-700 active:bg-amber-800`
- **secondary**: `bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-600/10 dark:text-amber-400 dark:hover:bg-amber-600/20`
- **ghost**: `text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/[0.06]`
- **danger**: `bg-rose-600 text-white hover:bg-rose-700 active:bg-rose-800`

Sizes:
- `md`: `px-4 py-2`
- `sm`: `px-3 py-1.5`
- `icon`: `p-2` (min 36×36px target)

### Inputs

```
rounded-lg text-sm bg-white dark:bg-[#242430]
border border-zinc-200 dark:border-white/[0.08]
text-zinc-900 dark:text-zinc-100
placeholder:text-zinc-400 dark:placeholder:text-zinc-500
focus:outline-none focus:ring-2 focus:ring-amber-500
focus:border-transparent transition-shadow duration-150
```

### Panels

```
bg-[#FDFCFA] dark:bg-[#18181D]
border border-zinc-200 dark:border-white/[0.07]
rounded-xl
```

No shadow inside the dashboard. Shadow only on modals and floating elements.

### Modals

```
bg-[#FDFCFA] dark:bg-[#18181D]
border border-zinc-200 dark:border-white/[0.1]
rounded-2xl shadow-2xl
```

Backdrop: `bg-black/55`

### Score / Data Badges

```
font-mono text-[10px] font-semibold
px-1.5 py-0.5 rounded
```

Tier colors:

| Score | Light | Dark |
|-------|-------|------|
| 5 | `bg-emerald-600 text-white ring-2 ring-emerald-300` | same |
| 4 | `bg-emerald-100 text-emerald-700` | `dark:bg-emerald-900/60 dark:text-emerald-200` |
| 3 | `bg-amber-100 text-amber-700` | `dark:bg-amber-900/40 dark:text-amber-200` |
| 0–2 | `bg-zinc-200 text-zinc-600` | `dark:bg-white/[0.07] dark:text-zinc-400` |

When `aiScoresStale`: `opacity-50`, prepend `~` to label.

### Sidebar Item

```
flex items-center justify-between px-3 py-2 rounded-lg
text-sm font-medium cursor-pointer
transition-colors duration-100
text-zinc-700 dark:text-zinc-300
hover:bg-white dark:hover:bg-white/[0.05]
```

Selected:
```
bg-amber-50 dark:bg-amber-600/[0.12]
text-amber-700 dark:text-amber-400
border-l-2 border-amber-500 dark:border-amber-400
```

### Status Chips (AI bar, status bar)

```
inline-flex items-center gap-1.5 px-2 py-1 rounded
text-[10px] font-mono font-semibold
```

Tones:
- `success`: `bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400`
- `warning`: `bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300`
- `accent`: `bg-amber-100 dark:bg-amber-600/15 text-amber-700 dark:text-amber-400`
- `neutral`: `bg-zinc-100 dark:bg-white/[0.06] text-zinc-600 dark:text-zinc-300`

---

## Layout

### Three-Pane App

| Region | Width | Surface |
|--------|-------|---------|
| Left sidebar | `w-52` fixed | `surface/sidebar` |
| Center post list | `flex-1` | `surface/page` |
| Right detail | `w-96` fixed | `surface/panel` |

- Sidebar and page share the same background in dark mode — the border-r divides them
- Detail pane has a visibly lighter surface than the page
- Mobile collapses to task-specific views with bottom nav

### Scrollbar (dark mode)
```css
--scrollbar-thumb: #3D3820;
--scrollbar-thumb-hover: #6B6030;
```
Amber-toned scrollbar thumb — subtle, on-brand.

---

## AI Module

### Inline status bar (above post list)

Single compact row, ~40px. Never a card.

```
[status dot]  [status label]  ·  [goal summary, truncated]   [scored/total]  [N strong]  [Rerank] [Edit AI] [Reasons]
```

Status dot: `bg-amber-400` active, `bg-amber-400 animate-pulse` ranking, `bg-zinc-600` off

Stats: `font-mono text-[10px]`

### Settings panel (AI section)

Fixed order:
1. Section header + enable toggle
2. Goal — preset chips → textarea
3. Tune (collapsible) — Exclude · Few-shot examples
4. Model & Key (collapsible)
5. Prompt preview (toggle link, hidden default)
6. Status banners — error (rose) then stale warning (orange)
7. Run ranking button (full width, primary amber)

---

## Landing Page

Dark-only surface. CSS variables:

```css
:root {
  --signal:        #D97706;
  --signal-hover:  #B45309;
  --signal-active: #92400E;
  --signal-glow:   rgba(217, 119, 6, 0.18);
  --bg:            #0C0D0F;
  --surface:       #161619;
  --surface-2:     #1D1D22;
  --surface-3:     #111115;
  --border:        rgba(255,255,255,0.07);
  --border-mid:    rgba(255,255,255,0.12);
}
```

Top-bar gradient: `linear-gradient(90deg, #D97706 0%, rgba(217,119,6,0.3) 40%, transparent 100%)`

Hero glow: `radial-gradient(ellipse 75% 55% at 50% -5%, rgba(217,119,6,0.12) 0%, transparent 65%)`

Buttons:
- `.btn-primary`: `background: var(--signal); box-shadow: 0 6px 28px var(--signal-glow)`
- `.btn-ghost`: unchanged (white/5%, border-mid)

---

## Scope and Build

CSS compiled with `npm run build:css` — Tailwind JIT, content: `./public/**/*.{html,js}`.

After any class name changes in JS files, rebuild CSS.

### What this system does NOT include
- Stone-* colors (only zinc)
- Violet, purple, or indigo in any role
- Italic typography
- Serif fonts
- Light mode on the landing page
- Shadow-heavy UI inside the dashboard

### Migration notes from v1
- `#0284C7` / `#0369A1` / `#075985` → replaced by amber equivalents
- `sky-*` classes used as accent → replaced by `amber-*`
- `dark:bg-zinc-900` page bg → `#0D0D10` (warmer)
- `dark:bg-zinc-800` panel bg → `#18181D` (warmer)
- `dark:border-zinc-700` → `dark:border-white/[0.07]`
- Amber warnings → migrate to `orange-*` classes to avoid accent collision
- Body font `DM Sans` → `Plus Jakarta Sans`
- Display use cases → `Syne`
