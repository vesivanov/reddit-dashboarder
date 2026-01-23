Reddit Dashboarder Design System v2
0) Principles

Intent-first: choose tokens/recipes by meaning (primary, muted, danger), not by color preference.

No drift: each semantic token has exactly one Tailwind mapping.

Density-aware: dashboard UI supports compact and comfortable spacing.

Accessible by default: keyboard focus is consistent; contrast is checked; motion respects preferences.

1) Foundations
1.1 Color tokens (single mapping)
Surfaces

surface/app (page background)
bg-zinc-100 dark:bg-zinc-900

surface/panel (panes, cards, toolbars, modals)
bg-white dark:bg-zinc-800

surface/muted (subtle inset areas inside panel)
bg-zinc-50 dark:bg-zinc-800/50

surface/raised (dropdowns, popovers)
bg-white dark:bg-zinc-800 + shadow-lg

surface/selected (selected row/region)
bg-indigo-50 dark:bg-indigo-900/30

surface/overlay (modal backdrop)
bg-black/40

Borders

border/default
border-zinc-200 dark:border-zinc-700

border/strong
border-zinc-300 dark:border-zinc-600

Text

text/primary
text-zinc-900 dark:text-zinc-100

text/secondary
text-zinc-600 dark:text-zinc-400

text/muted (safe tertiary for most metadata)
text-zinc-500 dark:text-zinc-500

text/link
text-indigo-700 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300

Accent + semantics

accent/primary (primary actions + highlights)
bg-indigo-600 text-white hover:bg-indigo-700 active:bg-indigo-800

accent/soft (soft selection chips, subtle highlights)
bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300

semantic/success
text-emerald-700 dark:text-emerald-300 + bg-emerald-100 dark:bg-emerald-900/50

semantic/warning
text-amber-700 dark:text-amber-300 + bg-amber-100 dark:bg-amber-900/40

semantic/danger
text-rose-600 dark:text-rose-300 + bg-rose-100 dark:bg-rose-900/40

1.2 Typography tokens

Font: font-sans (Inter loaded)

Scale

text-xs labels/microcopy

text-sm default UI

text-base body/detail

text-lg section titles

Numbers: counts use tabular-nums

Truncation: list primary lines usually truncate; detail view wraps.

1.3 Radius, elevation, z-index

Radius

controls: rounded-lg

modals: rounded-xl

chips: rounded-full

Elevation

in-app: prefer borders; minimal shadow

popovers: shadow-lg

modal: shadow-xl

Z-index scale

dropdown/popover: z-40

modal: z-50

toast: z-[60] (if needed)

1.4 Motion

Default: transition-colors duration-150

Optional: transition-transform duration-150

Respect reduced motion (when you centralize): disable non-essential animations.

2) Universal Interaction Contract (no exceptions)
2.1 Focus ring (buttons/links/icon buttons)

Use focus-visible so mouse clicks don’t draw rings:

focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500

focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-900

2.2 Focus ring (text inputs)

Use focus::

focus:outline-none focus:ring-2 focus:ring-indigo-500

focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-zinc-900

focus:border-transparent

2.3 Disabled + hit targets

Disabled: disabled:opacity-50 disabled:cursor-not-allowed

Icon buttons should aim for ~40×40px (use p-2 and don’t shrink below).

3) Density system (pick one per surface)

Define two spacing modes for repeated UI:

Comfortable (default)
List row: px-3 py-2.5
Toolbar: px-4 py-2.5
Panel: p-4

Compact (power user)
List row: px-3 py-2
Toolbar: px-3 py-2
Panel: p-3

Rule: a screen should not mix densities in the same region.

4) Component recipes (Tailwind-first)
4.1 Buttons

Button base (required)

inline-flex items-center justify-center gap-2 rounded-lg

text-sm font-medium leading-5

transition-colors duration-150

disabled:opacity-50 disabled:cursor-not-allowed

focus-visible ring (from contract)

Primary

bg-indigo-600 text-white hover:bg-indigo-700 active:bg-indigo-800

Secondary

bg-transparent text-zinc-700 hover:bg-zinc-100 active:bg-zinc-200

dark:text-zinc-200 dark:hover:bg-zinc-700 dark:active:bg-zinc-600

Ghost

bg-transparent text-zinc-600 hover:bg-zinc-100 active:bg-zinc-200

dark:text-zinc-300 dark:hover:bg-zinc-700 dark:active:bg-zinc-600

Danger

bg-rose-600 text-white hover:bg-rose-700 active:bg-rose-800

Sizes

md: px-4 py-2

sm: px-3 py-1.5

icon: p-2

4.2 Links

text-indigo-700 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300

Apply focus-visible ring like buttons if the link is a primary control.

4.3 Inputs

Text / Textarea / Select

rounded-lg text-sm bg-white dark:bg-zinc-700 dark:text-white

border border-zinc-200 dark:border-zinc-600

focus contract for inputs

Checkbox / Radio (simple)

Use native + focus ring + label click target (min 40px total row height)

4.4 Chips + Badges

Chip (neutral)

px-2.5 py-1 rounded-full text-xs font-medium

bg-zinc-100 text-zinc-700 hover:bg-zinc-200

dark:bg-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-600

Chip (selected) - use accent/soft

bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300

Rule: Filter chips (upvotes, comments, etc.) should use selected style when active, NOT semantic colors. Only use semantic colors for status/result badges.

Badge (neutral)

px-2 py-0.5 rounded-full text-xs font-medium

bg-zinc-100 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200

Badge (success/warn/danger) use semantic tokens above.

4.5 List row (sidebar + posts)

Base

rounded-lg transition-colors

hover:bg-zinc-50 dark:hover:bg-zinc-700

recommended anatomy:

left: icon/avatar (fixed)

middle: title (truncate) + subtitle (secondary)

right: meta (muted + tabular-nums)

Selected

bg-indigo-50 dark:bg-indigo-900/30

primary text shifts: text-indigo-700 dark:text-indigo-300

4.6 Panels, toolbars, separators

Panel

surface/panel + border border/default + rounded-lg

Toolbar

surface/panel + border-b border/default + padding (density)

Sidebar

surface/panel + border-r border/default

Divider

border-t border/default

4.7 Modal

Overlay: fixed inset-0 z-50 bg-black/40 p-4 flex items-center justify-center

Container: w-full max-w-md bg-white dark:bg-zinc-800 rounded-xl shadow-xl

Header/Footer: borders default + sticky optional

4.8 Feedback components

Inline banner (status/error/auth)

Container: rounded-lg border border/default p-3

Variants:

success: semantic success background/text

warning: semantic warning background/text

danger: semantic danger background/text

Copy rule: “What happened + what to do next”.

Toast (optional)

Use raised surface + shadow + border/default; z-[60]

4.9 Skeleton loading (recommended)

Row skeleton: animate-pulse blocks with bg-zinc-200 dark:bg-zinc-700

Use skeletons for lists + detail, not just spinners.

5) Domain-specific: AI scoring

AI relevance badge tiers

High (≥8): bg-emerald-600 text-white (ring-2 ring-emerald-300 dark:ring-emerald-400/30 for emphasis)

Likely (≥7): bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-200

Maybe (≥5): bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-200

Low: use neutral badge (bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400)

AI progress indicator bars (visual score representation)

High (≥8): bg-emerald-600 (solid, no dark variant)

Likely (≥7): bg-emerald-500 dark:bg-emerald-400

Maybe (≥5): bg-amber-500 dark:bg-amber-400

Low: bg-zinc-400 dark:bg-zinc-500

AI status text (in status bar)

Active/Loading: text-emerald-700 dark:text-emerald-300 (use semantic success text)

Inactive: text-zinc-500 (use muted text)

6) Patterns (this is what stops “screen-by-screen drift”)
6.1 Filter toolbar pattern

Left: search → chips → sort select
Right: view toggles + primary CTA (only one)

6.2 List + detail pattern

List rows use consistent anatomy + truncation

Detail header has: title (wrap), metadata (muted), actions (icon buttons)

6.3 Empty state pattern

Icon in muted circle

Title (lg, semibold)

One sentence guidance

One primary action

6.4 Error/retry pattern

Banner at top of the relevant pane

Include “Retry” (secondary) and “Details” (ghost/link) if needed

7) Accessibility checklist (non-negotiable)

All controls reachable by keyboard

Icon-only buttons require aria-label

Focus rings must be visible in both themes

Don’t use muted text for essential content

Prefer real buttons for actions (not divs)

Reduced motion respected when you add animations