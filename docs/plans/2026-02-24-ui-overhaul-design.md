# UI Overhaul Design: Neon Dark Polish

**Date:** 2026-02-24
**Goal:** Transform Crane's functional-but-flat UI into a vibrant, polished desktop app with proper iconography, accessible interactive primitives, and a bold "Neon Dark" visual identity.

## Aesthetic

"Neon Dark" — deep near-black backgrounds, high-saturation accents, glow effects on interactive elements, gradient progress indicators. Hybrid of Arc Browser's refined surfaces and Raycast/Warp's bold color confidence.

## Dependencies Added

| Package | Purpose | Size Impact |
|---------|---------|-------------|
| `lucide-solid` | Tree-shakeable icon library (1400+ icons, SolidJS binding) | ~1KB per icon used |
| `@kobalte/core` | Headless accessible UI primitives (dialog, tooltip, select, tabs, combobox) | ~15KB |

## 1. Enhanced Theme (globals.css)

### Revised Dark Palette

| Token | Old | New |
|-------|-----|-----|
| `--bg` | `#0D0D0D` | `#09090B` |
| `--active` | `#3B82F6` | `#6366F1` (indigo) |
| `--accent` | `#8B5CF6` | `#A855F7` (vivid purple) |
| `--success` | `#22C55E` | `#34D399` (emerald) |
| `--warning` | `#F59E0B` | `#FBBF24` (bright amber) |
| `--error` | `#EF4444` | `#F87171` (bright red) |

### New Tokens

- `--glass`: `rgba(255,255,255,0.04)` — translucent panel fill
- `--glow-active`: `0 0 20px rgba(99,102,241,0.25)` — indigo glow
- `--glow-success`: `0 0 20px rgba(52,211,153,0.25)` — success glow
- `--gradient-accent`: `linear-gradient(135deg, var(--active), var(--accent))` — indigo-to-purple

### Visual Treatments

- **Borders**: Semi-transparent (`rgba(255,255,255,0.06)`) for glass feel
- **Progress bars**: Animated gradient (indigo → purple) with shimmer keyframe
- **Active states**: Glow ring + gradient highlight
- **Surfaces**: `backdrop-blur-sm` on panels for depth

## 2. Icon System (Lucide)

Replace all Unicode characters and inline SVGs with Lucide icons.

### Sidebar Icons

| Filter | Icon |
|--------|------|
| All Downloads | `Download` |
| Active | `Play` |
| Queued | `Clock` |
| Completed | `CheckCircle` |
| Failed | `XCircle` |
| Paused | `Pause` |
| Documents | `FileText` |
| Video | `Video` |
| Audio | `Music` |
| Images | `Image` |
| Archives | `Archive` |
| Software | `Box` |
| Other | `File` |

### Action Button Icons

| Action | Icon |
|--------|------|
| Pause download | `Pause` |
| Resume download | `Play` |
| Retry download | `RotateCcw` |
| Open file | `ExternalLink` |
| Open folder | `FolderOpen` |
| Settings gear | `Settings` |
| Browse folder | `FolderOpen` |
| Collapse sidebar | `ChevronLeft` |
| Expand sidebar | `ChevronRight` |

### Icon Sizing

- Sidebar: 18px, `stroke-width: 1.75`
- Action buttons: 16px, `stroke-width: 1.75`
- Color inherits from parent text color

## 3. Kobalte Component Upgrades

| UI Element | Current | Kobalte Primitive |
|------------|---------|-------------------|
| Settings modal | Custom `<Show>` overlay | `Dialog` — focus trap, ESC, ARIA |
| Command palette | Custom keyboard handler | `Combobox` — search, keyboard nav |
| Category/connection dropdowns | Native `<select>` | `Select` — styled with icons |
| Action button tooltips | `title` attribute | `Tooltip` — animated, positioned |
| Settings sections | Flat list | `Tabs` — keyboard-navigable |

What stays hand-rolled: Download cards, progress bars, sidebar layout, speed graph, connection segments.

## 4. Micro-animations

- **Progress shimmer**: `@keyframes` sweep across gradient bar
- **Download card enter**: Subtle slide-in for new items
- **Hover actions**: Fade-in with slight scale (1.0 → 1.02) on icon buttons
- **Sidebar active indicator**: Animated left bar sliding between items
- **Theme transition**: `transition: background-color 200ms` on swap

## Files to Modify

1. `package.json` — add `lucide-solid`, `@kobalte/core`
2. `src/styles/globals.css` — revised palette, new tokens, glass/glow utilities, keyframes
3. `src/components/layout/Sidebar.tsx` — Lucide icons, active indicator, glow
4. `src/components/downloads/DownloadCard.tsx` — icon buttons with Kobalte tooltips, gradient progress
5. `src/components/UrlInput.tsx` — icon buttons, Kobalte Select for dropdowns
6. `src/components/settings/SettingsPanel.tsx` — Kobalte Dialog + Tabs
7. `src/components/command-palette/CommandPalette.tsx` — Kobalte Combobox
8. All settings sections — Kobalte Select for dropdowns
9. `src/components/layout/DetailPanel.tsx` — Lucide icons, visual polish

## Out of Scope

- No new pages or features
- No restructuring of component hierarchy
- No backend changes
- Light theme updates deferred (dark-first, light follows)
