# Design System (Reddit Dashboarder)

This document defines a coherent, reusable UI language for the entire site/app. It is intentionally **implementation-friendly** for the current stack: **Tailwind (CDN)** + **Inter** + **light/dark mode via `dark` class**.

## Goals

- **Clarity over decoration**: dense information, fast scanning, minimal visual noise.
- **Consistency**: the same UI intent uses the same tokens and component recipes everywhere.
- **Themeable**: parity between light and dark with predictable semantics.
- **Accessible by default**: keyboard, focus, contrast, and motion-reduction are first-class.

## Brand & Visual Language

- **Typeface**: Inter (already loaded), with system fallbacks.
- **Base palette**: neutral **zinc** surfaces and text; **indigo** for primary actions/focus; **emerald/amber/rose** for semantic signals.
- **Shape**: soft corners (mostly `rounded-lg`), subtle borders, restrained shadows.
- **Motion**: quick, functional transitions (100–200ms). Prefer opacity/transform changes.

## Design Tokens

Tokens are described two ways:
- **Semantic names**: what the token *means* (preferred in docs and component specs).
- **Tailwind mapping**: what to *use today* in this repo.

### Color tokens

#### Neutrals (surfaces + borders)

- **`bg/app`**: overall app background  
  - Tailwind: `bg-zinc-100 dark:bg-zinc-900`
- **`bg/surface`**: panels, toolbars, modals  
  - Tailwind: `bg-white dark:bg-zinc-800`
- **`bg/surface-muted`**: subtle contrast surface (lists, mid-panels)  
  - Tailwind: `bg-zinc-50 dark:bg-zinc-800/50` or `bg-zinc-50 dark:bg-zinc-900`
- **`border/default`**: separators and outlines  
  - Tailwind: `border-zinc-200 dark:border-zinc-700`
- **`border/strong`**: stronger dividers or selected outlines  
  - Tailwind: `border-zinc-300 dark:border-zinc-600`

#### Text (hierarchy)

- **`text/primary`**: main content  
  - Tailwind: `text-zinc-900 dark:text-white` (or `dark:text-zinc-100`)
- **`text/secondary`**: supporting text  
  - Tailwind: `text-zinc-600 dark:text-zinc-400`
- **`text/tertiary`**: metadata, timestamps, counts  
  - Tailwind: `text-zinc-400 dark:text-zinc-500`

#### Brand / emphasis

- **`accent/primary`**: primary action, selection, focus ring  
  - Tailwind: `bg-indigo-600 text-white hover:bg-indigo-700`
  - Selection surfaces: `bg-indigo-50 dark:bg-indigo-900/30`
  - Text on selection: `text-indigo-700 dark:text-indigo-400`
- **`accent/focus`**: focus indicator  
  - Tailwind: `focus:ring-2 focus:ring-indigo-500 focus:border-transparent`

#### Semantics

- **`semantic/success`** (good / high relevance):  
  - Tailwind: `text-emerald-700 dark:text-emerald-400`, `bg-emerald-100 dark:bg-emerald-900/50`
- **`semantic/warning`** (caution / medium relevance):  
  - Tailwind: `text-amber-700 dark:text-amber-400`, `bg-amber-100 dark:bg-amber-900/50`
- **`semantic/danger`** (errors / destructive):  
  - Tailwind: `text-rose-600 dark:text-rose-400`

### Typography tokens

- **Font family**: `Inter, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial`
- **Weights**:
  - **Regular**: 400
  - **Medium**: 500
  - **Semibold**: 600
  - **Bold**: 700
- **Type scale (recommended)**:
  - **`text-xs`**: 12px (labels, microcopy)
  - **`text-sm`**: 14px (most UI controls + lists)
  - **`text-base`**: 16px (body text in detail view)
  - **`text-lg`**: 18px (section titles / empty state titles)
- **Line height**:
  - UI text: `leading-5` / `leading-6`
  - Body text: ~1.6 (see `.post-body`)

### Spacing & layout tokens

- **Base spacing unit**: 4px (Tailwind default).
- **Common paddings**:
  - Toolbar: `px-4 py-2` / `py-2.5`
  - Panel: `p-3` or `p-4`
- **Gaps**:
  - Dense: `gap-1.5` / `space-y-1`
  - Standard: `gap-2` / `gap-3` / `space-y-4`

### Radius tokens

- **Small**: `rounded` (4px) for micro elements
- **Standard**: `rounded-lg` (8px) for most controls
- **Large**: `rounded-xl` (12px) for modals
- **Pills**: `rounded-full` for chips

### Elevation tokens

- **Modal elevation**: `shadow-xl` on `rounded-xl` surface
- **In-app elevation**: avoid heavy shadows; prefer borders + subtle surface differences

### Motion tokens

- **Standard transition**: `transition-colors` (plus `transition-transform` where needed)
- **Duration**: 150ms typical
- **Animation**: `animate-fadeIn` (opacity + translateY) for newly shown content
- **Reduce motion**: when implementing globally, respect `prefers-reduced-motion` (disable non-essential animations)

## Theme Rules (Light + Dark)

- **Switching strategy**: theme is controlled by toggling the `dark` class on the root element.
- **Parity rule**: every component recipe must specify both light and dark values for:
  - Surface
  - Border
  - Text
  - Hover/active states
  - Focus ring

## Layout System

### Primary layout: three-pane dashboard

- **Header**: fixed-height top bar with title + utility actions.
- **Status bar**: thin row under header for fetch status, errors, “updated”, and primary CTA.
- **Main panes**:
  - **Left sidebar**: subreddits list  
    - Width: `w-52` (208px)
  - **Center pane**: post list + filter toolbar  
    - Flexible: `flex-1 min-w-0`
  - **Right pane**: post detail view  
    - Collapsible; on mobile becomes a separate view

### Responsive breakpoints

- **Desktop** (`lg` and up): show all panes; sidebar is persistent.
- **Mobile**: single-pane view with bottom navigation (“Subs”, “Posts”, “Detail”).

### Scrolling

- Panes scroll independently (avoid scrolling the entire page when possible).
- Use consistent thin scrollbars (`scrollbar-thin`) with light/dark thumb colors.

## Component Recipes (Tailwind-first)

These are the “approved” building blocks. Implement them as reusable class strings (or later as React components) so they stay consistent.

### Buttons

#### Primary button (`Button/Primary`)

Use for the single most important action in a context (e.g., “Refresh”, “Sign in”, “Add”).

- Tailwind:
  - `px-4 py-2 rounded-lg text-sm font-medium`
  - `bg-zinc-900 text-white hover:bg-zinc-800`
  - `dark:bg-indigo-600 dark:hover:bg-indigo-700`
  - `disabled:opacity-50 transition-colors`

#### Secondary button (`Button/Secondary`)

Use for neutral actions (e.g., “Cancel”).

- Tailwind:
  - `px-4 py-2 rounded-lg text-sm font-medium`
  - `text-zinc-600 hover:bg-zinc-100`
  - `dark:text-zinc-400 dark:hover:bg-zinc-700`
  - `transition-colors`

#### Ghost / icon button (`Button/Icon`)

Use for toolbar actions (settings, theme toggle, close).

- Tailwind:
  - `p-2 rounded-lg`
  - `text-zinc-600 hover:bg-zinc-100`
  - `dark:text-zinc-400 dark:hover:bg-zinc-700`
  - `transition-colors`

### Inputs

#### Text input (`Input/Text`)

- Tailwind:
  - `w-full px-3 py-2 rounded-lg text-sm`
  - `border border-zinc-200 bg-white`
  - `dark:border-zinc-600 dark:bg-zinc-700 dark:text-white`
  - `focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent`

#### Select (`Input/Select`)

- Tailwind:
  - `px-2 py-1.5 rounded-lg text-sm`
  - `border border-zinc-200 bg-white`
  - `dark:border-zinc-600 dark:bg-zinc-700 dark:text-white`
  - `disabled:opacity-50`

#### Textarea (`Input/Textarea`)

Same as `Input/Text`, with `rows` and slightly larger vertical padding as needed.

### Toggles (`Toggle/Switch`)

Use for binary settings.

- Track:
  - Base: `relative w-11 h-6 rounded-full transition-colors`
  - On: `bg-indigo-600`
  - Off: `bg-zinc-300 dark:bg-zinc-600`
- Thumb:
  - `absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform`
  - On: add `translate-x-5`

### Pills / chips (`Chip`)

Use for selectable presets (e.g., upvotes/comments filters) and “popular subreddit” chips.

- Neutral chip:
  - `px-2.5 py-1 rounded-full text-xs font-medium`
  - `bg-zinc-100 text-zinc-700 hover:bg-zinc-200`
  - `dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600`
- Selected semantic chip:
  - Success: `bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400`
  - Warning: `bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400`

### List rows (`List/Row`)

Use for sidebar items and post list items.

- Base:
  - `rounded-lg transition-colors`
  - Hover: `hover:bg-zinc-50 dark:hover:bg-zinc-700`
- Selected:
  - `bg-indigo-50 dark:bg-indigo-900/30`
  - Primary text: `text-indigo-700 dark:text-indigo-400`

### Panels & toolbars

- Toolbar surface:
  - `bg-white dark:bg-zinc-800`
  - `border-b border-zinc-200 dark:border-zinc-700`
  - `px-4 py-2.5`
- Sidebar surface:
  - `bg-white dark:bg-zinc-800`
  - `border-r border-zinc-200 dark:border-zinc-700`

### Modals (`Modal`)

Use for “Add subreddits”, “Settings”, etc.

- Overlay:
  - `fixed inset-0 z-50 bg-black/40 p-4 flex items-center justify-center`
- Container:
  - `w-full max-w-md` (or `max-w-lg`)
  - `bg-white dark:bg-zinc-800 rounded-xl shadow-xl`
  - For long content: `max-h-[90vh] overflow-auto`
- Header:
  - `p-4 border-b border-zinc-200 dark:border-zinc-700 flex items-center justify-between`
  - Sticky headers: `sticky top-0 bg-white dark:bg-zinc-800`
- Footer:
  - `p-4 border-t border-zinc-200 dark:border-zinc-700 flex justify-end gap-2`

### Empty states

Empty states should always include:
- **Icon** (simple outline) in a muted circular surface
- **Title** (semibold)
- **One-sentence guidance**
- **One clear next action** (button/link)

Suggested base:
- Icon container: `w-16 h-16 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center`
- Title: `text-lg font-semibold text-zinc-900 dark:text-white`
- Body: `text-sm text-zinc-500 dark:text-zinc-400 text-center max-w-xs`

### Status & feedback

- **Loading**: small spinner + “Fetching…” in secondary text.
- **Error**: `text-rose-600 dark:text-rose-400 font-medium` (keep wording short and actionable).
- **Auth required / warning**: `text-amber-600 dark:text-amber-400 font-medium`.
- **AI active**: `text-emerald-500` (avoid too many green indicators at once).

## Data Visualization & AI Scoring (Domain-specific)

### AI relevance score badge (`Badge/AIRelevance`)

Use **three tiers** for readability and stable meaning:

- **High** (≥ 8): “strongly relevant”  
  - `bg-emerald-500 dark:bg-emerald-600 text-white`
- **Medium-high** (≥ 7): “likely relevant”  
  - `bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300`
- **Medium** (≥ 5): “maybe relevant”  
  - `bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400`
- **Low** (< 5): treat as neutral; don’t over-emphasize.

### Confidence label (`Badge/Confidence`)

- High: emerald semantic chip styling
- Medium: amber semantic chip styling
- Low: neutral chip styling

## Interaction States

Every interactive component must specify:

- **Default**
- **Hover**
- **Active/pressed** (optional but recommended for buttons)
- **Disabled** (`disabled:opacity-50`, plus `disabled:cursor-not-allowed` when appropriate)
- **Focus-visible** (ring on inputs; visible outline on buttons if added later)

## Accessibility Standards

- **Keyboard**:
  - All controls reachable via Tab.
  - Icon-only buttons must have an accessible label (`title` is a fallback; prefer `aria-label` when formalizing components).
- **Hit targets**:
  - Minimum 40×40px for icon buttons where feasible.
- **Focus**:
  - Use the indigo focus ring (`focus:ring-indigo-500`) and avoid removing outlines without replacement.
- **Contrast**:
  - Default text must pass contrast on both themes; avoid using `text-zinc-400` for essential information.
- **Motion**:
  - When you centralize motion rules, respect `prefers-reduced-motion`.

## Content & Microcopy

- Prefer short, descriptive verbs: “Add”, “Refresh”, “Clear”.
- Errors should be specific and actionable (what happened + what to do next).
- Use consistent terminology:
  - “Subreddits”, “Posts”, “Detail”
  - “AI ranking”, “AI relevance”, “AI score”

## Implementation Guidance (when you’re ready)

- **Centralize recipes**: create a small `ui/` module (or constants in `index.html`) that exports class strings for each component type.
- **Prefer semantic composition**: choose the component recipe based on intent (Primary vs Secondary), not on color preference.
- **Keep tokens stable**: if you change a token (e.g., accent color), update the mapping once and let the whole UI follow.

