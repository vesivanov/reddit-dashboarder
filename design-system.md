# Dashboard Design System

This file is the current UI reference for the dashboard under `public/index.html` and the split frontend runtime in `public/app*.js`.

The implementation is Tailwind-first, dark-mode aware, and optimized for dense dashboard workflows rather than marketing pages.

## Aesthetic Identity

**Direction**: Signal Intelligence — a data-dense monitoring tool with an editorial edge. Purposeful, sharp, warm.

**Typography**
- Display / headings: `DM Serif Display` — elegant contrast against data density
- UI copy / body: `DM Sans` — modern, readable, distinctly not Inter
- Numbers / data / code: `JetBrains Mono` — scores, counts, metrics, timestamps

All three fonts are loaded via Google Fonts in `index.html` and `landing.html`.

**Color**
Primary accent is signal orange (`#E8541A`) — Reddit-adjacent, warm, high-contrast against zinc surfaces. Replaces generic indigo throughout.

## Principles

- Use semantic intent, not ad hoc color picks.
- Prefer borders over heavy shadows inside the app.
- Keep repeated regions density-consistent.
- Default to keyboard-visible focus states.
- Treat the dashboard and landing page as separate surfaces.
- Numbers and scores always render in `JetBrains Mono`.

## Semantic Tokens

### Surfaces

- `surface/app`: `bg-zinc-100 dark:bg-zinc-900`
- `surface/panel`: `bg-white dark:bg-zinc-800`
- `surface/muted`: `bg-zinc-50 dark:bg-zinc-800/50`
- `surface/raised`: `bg-white dark:bg-zinc-800 shadow-lg`
- `surface/selected`: `bg-orange-50 dark:bg-[#E8541A]/15`
- `surface/overlay`: `bg-black/40`

### Borders

- `border/default`: `border-zinc-200 dark:border-zinc-700`
- `border/strong`: `border-zinc-300 dark:border-zinc-600`
- `border/accent`: `border-[#E8541A] dark:border-[#E8541A]`

### Text

- `text/primary`: `text-zinc-900 dark:text-zinc-100`
- `text/secondary`: `text-zinc-600 dark:text-zinc-400`
- `text/muted`: `text-zinc-500`
- `text/link`: `text-[#D14A14] hover:text-[#E8541A] dark:text-orange-400 dark:hover:text-orange-300`
- `text/data`: `font-mono text-zinc-900 dark:text-zinc-100` (JetBrains Mono for scores, counts)

### Actions and States

- `accent/primary`: `bg-[#E8541A] text-white hover:bg-[#D14A14] active:bg-[#B83F10]`
- `accent/soft`: `bg-orange-50 text-[#D14A14] dark:bg-[#E8541A]/15 dark:text-orange-300`
- `success`: `text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/50`
- `warning`: `text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/40`
- `danger`: `text-rose-600 dark:text-rose-300 bg-rose-100 dark:bg-rose-900/40`

## Typography

- Base UI copy: `text-sm font-sans`
- Detail/body copy: `text-base font-sans`
- Section labels: `text-lg font-sans`
- Metadata and dense labels: `text-xs font-sans`
- Counts, scores, and metrics: `font-mono tabular-nums`
- Section headings (where appropriate): `font-serif`

The app assumes DM Sans for all UI text and JetBrains Mono for any numerical or code-like data.

## Focus and Interaction

Buttons and links:

```text
focus-visible:outline-none
focus-visible:ring-2
focus-visible:ring-[#E8541A]
focus-visible:ring-offset-2
focus-visible:ring-offset-white
dark:focus-visible:ring-offset-zinc-900
```

Inputs:

```text
focus:outline-none
focus:ring-2
focus:ring-[#E8541A]
focus:ring-offset-2
focus:ring-offset-white
dark:focus:ring-offset-zinc-900
focus:border-transparent
```

Also keep:

- `disabled:opacity-50 disabled:cursor-not-allowed`
- icon targets around 40x40px minimum

## Motion

Animate high-impact moments only. Don't scatter micro-interactions.

- Page/panel entrance: `fadeUp` keyframe (opacity 0→1, translateY 20px→0, 0.4–0.6s ease-out)
- List item entrance: staggered `fadeUp` with `animation-delay` increments of 40–60ms
- Hover feedback: `transition-colors duration-150` for color shifts; `transition-transform` for lift
- Loading: `animate-spin` for spinners; prefer skeleton shimmer over bare spinners for content areas
- No animation on repeated/frequent state changes (avoid motion fatigue)

## Density Modes

Use one density per region.

Comfortable:

- list rows: `px-3 py-2.5`
- toolbars: `px-4 py-2.5`
- panels: `p-4`

Compact:

- list rows: `px-3 py-2`
- toolbars: `px-3 py-2`
- panels: `p-3`

## Component Recipes

### Buttons

Base:

```text
inline-flex items-center justify-center gap-2 rounded-lg
text-sm font-medium leading-5 transition-colors duration-150
disabled:opacity-50 disabled:cursor-not-allowed
```

Variants:

- primary: `bg-[#E8541A] text-white hover:bg-[#D14A14] active:bg-[#B83F10]`
- secondary: `text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-700`
- ghost: `text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-700`
- danger: `bg-rose-600 text-white hover:bg-rose-700 active:bg-rose-800`

Sizes:

- `md`: `px-4 py-2`
- `sm`: `px-3 py-1.5`
- `icon`: `p-2`

### Inputs

```text
rounded-lg text-sm bg-white dark:bg-zinc-700 dark:text-white
border border-zinc-300 dark:border-zinc-600
placeholder:text-zinc-400
```

### Panels

```text
bg-white dark:bg-zinc-800
border border-zinc-200 dark:border-zinc-700
```

Keep panel shadows light or absent inside the dashboard.

### Score / Data Badges

AI scores and numeric values use monospace and a warm accent:

```text
font-mono text-xs font-medium
bg-orange-50 dark:bg-[#E8541A]/15
text-[#D14A14] dark:text-orange-300
border border-orange-200 dark:border-[#E8541A]/30
rounded px-1.5 py-0.5
```

## Layout Guidance

- Left pane: navigation, subreddit sets, quick filters
- Center pane: sortable post list with dense scanning cues
- Right pane: reading detail, metadata, actions
- Mobile should collapse to task-specific views instead of forcing tiny three-column layouts

## Scope Boundary

This design system is for the dashboard UI. Marketing pages such as `public/landing.html`, `public/pricing.html`, and docs pages share the same typographic identity and color tokens but may diverge in layout and presentation density.
