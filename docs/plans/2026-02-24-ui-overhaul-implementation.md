# UI Overhaul Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform Crane's functional UI into a vibrant "Neon Dark" design with Lucide icons, Kobalte accessible primitives, gradient accents, and micro-animations.

**Architecture:** Add `lucide-solid` for icons and `@kobalte/core` for headless UI primitives. Rework `globals.css` with a more saturated palette, glass/glow tokens, and shimmer animations. Replace all inline SVGs and Unicode icons with Lucide components. Upgrade dropdowns, modals, and tooltips to Kobalte primitives.

**Tech Stack:** SolidJS, Tailwind CSS v4, lucide-solid, @kobalte/core

---

### Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install lucide-solid and @kobalte/core**

Run:
```bash
npm install lucide-solid @kobalte/core
```

**Step 2: Verify installation**

Run: `npm ls lucide-solid @kobalte/core`
Expected: Both packages listed without errors.

**Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds (tsc + vite).

**Step 4: Commit**

Message: `chore: add lucide-solid and @kobalte/core dependencies`

---

### Task 2: Update Theme — Neon Dark Palette & Utilities

**Files:**
- Modify: `src/styles/globals.css`

**Step 1: Update CSS variables and add new tokens**

Replace the `:root` dark palette and add new utility tokens:

```css
@import "tailwindcss";

@layer base {
  :root {
    --bg: #09090B;
    --surface: #131316;
    --surface-hover: #1C1C21;
    --border: rgba(255, 255, 255, 0.06);
    --text-primary: #EDEDEF;
    --text-secondary: #8B8B8F;
    --text-muted: #52525B;
    --active: #6366F1;
    --success: #34D399;
    --warning: #FBBF24;
    --error: #F87171;
    --accent: #A855F7;

    /* Glass & glow */
    --glass: rgba(255, 255, 255, 0.04);
    --glow-active: 0 0 20px rgba(99, 102, 241, 0.25);
    --glow-success: 0 0 16px rgba(52, 211, 153, 0.2);
    --glow-error: 0 0 16px rgba(248, 113, 113, 0.2);
  }

  .light {
    --bg: #FAFAFA;
    --surface: #FFFFFF;
    --surface-hover: #F4F4F5;
    --border: #E4E4E7;
    --text-primary: #18181B;
    --text-secondary: #71717A;
    --text-muted: #A1A1AA;
    --active: #4F46E5;
    --success: #10B981;
    --warning: #F59E0B;
    --error: #EF4444;
    --accent: #8B5CF6;

    --glass: rgba(0, 0, 0, 0.02);
    --glow-active: 0 0 12px rgba(79, 70, 229, 0.15);
    --glow-success: 0 0 12px rgba(16, 185, 129, 0.15);
    --glow-error: 0 0 12px rgba(239, 68, 68, 0.15);
  }

  body {
    background-color: var(--bg);
    color: var(--text-primary);
    font-variant-numeric: tabular-nums;
  }
}

@theme inline {
  --color-bg: var(--bg);
  --color-surface: var(--surface);
  --color-surface-hover: var(--surface-hover);
  --color-border: var(--border);
  --color-text-primary: var(--text-primary);
  --color-text-secondary: var(--text-secondary);
  --color-text-muted: var(--text-muted);
  --color-active: var(--active);
  --color-success: var(--success);
  --color-warning: var(--warning);
  --color-error: var(--error);
  --color-accent: var(--accent);
  --color-glass: var(--glass);
}

/* ─── Gradient accent ───────────────────────────── */
@layer utilities {
  .gradient-accent {
    background: linear-gradient(135deg, var(--active), var(--accent));
  }

  .glow-active {
    box-shadow: var(--glow-active);
  }

  .glow-success {
    box-shadow: var(--glow-success);
  }
}

/* ─── Progress shimmer animation ────────────────── */
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

@layer utilities {
  .progress-shimmer {
    background: linear-gradient(
      90deg,
      var(--active) 0%,
      var(--accent) 40%,
      color-mix(in srgb, var(--accent), white 30%) 50%,
      var(--accent) 60%,
      var(--active) 100%
    );
    background-size: 200% 100%;
    animation: shimmer 2s ease-in-out infinite;
  }
}
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds. All existing Tailwind classes still resolve since token names are unchanged.

**Step 3: Visual spot check**

Run: `cargo tauri dev`
Expected: App launches with deeper backgrounds, more vivid accent colors. No layout breaks.

**Step 4: Commit**

Message: `style: update theme to Neon Dark palette with glass/glow tokens`

---

### Task 3: Replace Sidebar Icons with Lucide

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`

**Step 1: Replace Unicode icons with Lucide components**

Replace the inline icon strings with Lucide imports and JSX. Replace the full file content:

```tsx
import { For, Show, createMemo } from "solid-js";
import type { Download } from "../../lib/types";
import {
  sidebarCollapsed,
  toggleSidebar,
  statusFilter,
  setStatusFilter,
  categoryFilter,
  setCategoryFilter,
  type StatusFilter,
  type CategoryFilter,
} from "../../stores/ui";
import {
  Download as DownloadIcon,
  Play,
  Clock,
  CheckCircle,
  XCircle,
  Pause,
  FileText,
  Video,
  Music,
  ImageIcon,
  Archive,
  Box,
  File,
  ChevronLeft,
  ChevronRight,
} from "lucide-solid";
import type { JSX } from "solid-js";

interface Props {
  downloads: Download[];
}

const ICON_PROPS = { size: 18, "stroke-width": 1.75 };

const STATUS_FILTERS: { key: StatusFilter; label: string; icon: () => JSX.Element }[] = [
  { key: "all", label: "All Downloads", icon: () => <DownloadIcon {...ICON_PROPS} /> },
  { key: "downloading", label: "Active", icon: () => <Play {...ICON_PROPS} /> },
  { key: "queued", label: "Queued", icon: () => <Clock {...ICON_PROPS} /> },
  { key: "completed", label: "Completed", icon: () => <CheckCircle {...ICON_PROPS} /> },
  { key: "failed", label: "Failed", icon: () => <XCircle {...ICON_PROPS} /> },
  { key: "paused", label: "Paused", icon: () => <Pause {...ICON_PROPS} /> },
];

const CATEGORY_FILTERS: { key: CategoryFilter; label: string; icon: () => JSX.Element }[] = [
  { key: "all", label: "All Types", icon: () => <File {...ICON_PROPS} /> },
  { key: "documents", label: "Documents", icon: () => <FileText {...ICON_PROPS} /> },
  { key: "video", label: "Video", icon: () => <Video {...ICON_PROPS} /> },
  { key: "audio", label: "Audio", icon: () => <Music {...ICON_PROPS} /> },
  { key: "images", label: "Images", icon: () => <ImageIcon {...ICON_PROPS} /> },
  { key: "archives", label: "Archives", icon: () => <Archive {...ICON_PROPS} /> },
  { key: "software", label: "Software", icon: () => <Box {...ICON_PROPS} /> },
  { key: "other", label: "Other", icon: () => <File {...ICON_PROPS} /> },
];

export default function Sidebar(props: Props) {
  const statusCounts = createMemo(() => {
    const counts: Record<string, number> = { all: props.downloads.length };
    for (const dl of props.downloads) {
      counts[dl.status] = (counts[dl.status] || 0) + 1;
    }
    return counts;
  });

  const categoryCounts = createMemo(() => {
    const counts: Record<string, number> = { all: props.downloads.length };
    for (const dl of props.downloads) {
      counts[dl.category] = (counts[dl.category] || 0) + 1;
    }
    return counts;
  });

  const collapsed = () => sidebarCollapsed();

  return (
    <div
      class={`flex-shrink-0 bg-bg border-r border-border flex flex-col transition-all duration-200 overflow-hidden ${
        collapsed() ? "w-12" : "w-52"
      }`}
    >
      {/* Collapse toggle */}
      <button
        onClick={toggleSidebar}
        class="flex items-center justify-center h-8 mt-1 mx-1 rounded hover:bg-surface-hover text-text-muted transition-colors"
        title={collapsed() ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed() ? <ChevronRight size={16} stroke-width={1.75} /> : <ChevronLeft size={16} stroke-width={1.75} />}
      </button>

      {/* Status filters */}
      <div class="mt-2">
        <Show when={!collapsed()}>
          <p class="px-3 mb-1 text-[10px] uppercase tracking-wider text-text-muted font-medium">
            Status
          </p>
        </Show>
        <For each={STATUS_FILTERS}>
          {(filter) => {
            const count = () => statusCounts()[filter.key] || 0;
            const active = () => statusFilter() === filter.key;

            return (
              <button
                onClick={() => setStatusFilter(filter.key)}
                class={`flex items-center w-full px-3 py-1.5 text-xs transition-colors ${
                  active()
                    ? "bg-active/10 text-active font-medium border-l-2 border-l-active"
                    : "text-text-secondary hover:bg-surface-hover hover:text-text-primary border-l-2 border-l-transparent"
                } ${collapsed() ? "justify-center" : "gap-2.5"}`}
                title={collapsed() ? `${filter.label} (${count()})` : undefined}
              >
                <span class="flex-shrink-0 w-5 flex items-center justify-center">{filter.icon()}</span>
                <Show when={!collapsed()}>
                  <span class="flex-1 text-left truncate">{filter.label}</span>
                  <span class="text-text-muted tabular-nums">{count()}</span>
                </Show>
              </button>
            );
          }}
        </For>
      </div>

      {/* Category filters */}
      <div class="mt-4">
        <Show when={!collapsed()}>
          <p class="px-3 mb-1 text-[10px] uppercase tracking-wider text-text-muted font-medium">
            Category
          </p>
        </Show>
        <For each={CATEGORY_FILTERS}>
          {(filter) => {
            const count = () => categoryCounts()[filter.key] || 0;
            const active = () => categoryFilter() === filter.key;

            return (
              <button
                onClick={() => setCategoryFilter(filter.key)}
                class={`flex items-center w-full px-3 py-1.5 text-xs transition-colors ${
                  active()
                    ? "bg-active/10 text-active font-medium border-l-2 border-l-active"
                    : "text-text-secondary hover:bg-surface-hover hover:text-text-primary border-l-2 border-l-transparent"
                } ${collapsed() ? "justify-center" : "gap-2.5"}`}
                title={collapsed() ? `${filter.label} (${count()})` : undefined}
              >
                <span class="flex-shrink-0 w-5 flex items-center justify-center">{filter.icon()}</span>
                <Show when={!collapsed()}>
                  <span class="flex-1 text-left truncate">{filter.label}</span>
                  <span class="text-text-muted tabular-nums">{count()}</span>
                </Show>
              </button>
            );
          }}
        </For>
      </div>
    </div>
  );
}
```

Key changes from original:
- All Unicode icon strings → Lucide components with consistent `ICON_PROPS`
- Active sidebar items now get `border-l-2 border-l-active` + `bg-active/10 text-active` (left accent bar + tinted bg)
- Note: `Image` is exported as `ImageIcon` in lucide-solid to avoid conflict with the global `Image` constructor

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds, no TypeScript errors.

**Step 3: Visual check**

Run: `cargo tauri dev`
Expected: Sidebar shows crisp Lucide icons, active item has indigo left bar + tinted background.

**Step 4: Commit**

Message: `feat(ui): replace sidebar unicode icons with Lucide`

---

### Task 4: Replace DownloadCard Text Buttons with Icon Buttons + Gradient Progress

**Files:**
- Modify: `src/components/downloads/DownloadCard.tsx`

**Step 1: Add Lucide imports and replace text buttons with icon buttons**

Add imports at top of file:

```tsx
import {
  Pause as PauseIcon,
  Play,
  RotateCcw,
  ExternalLink,
  FolderOpen,
  RefreshCw,
} from "lucide-solid";
```

Replace the hover actions section (the `{/* Hover actions */}` div and all its children) with icon buttons:

```tsx
        {/* Hover actions */}
        <div class="flex gap-1 items-center">
          <Show when={dl().status === "downloading"}>
            <button
              onClick={handlePause}
              class="p-1.5 rounded-md text-text-secondary hover:text-text-primary hover:bg-surface-hover opacity-0 group-hover:opacity-100 transition-all"
              title="Pause"
            >
              <PauseIcon size={15} stroke-width={1.75} />
            </button>
          </Show>

          <Show when={dl().status === "paused"}>
            <button
              onClick={handleResume}
              class="p-1.5 rounded-md text-text-secondary hover:text-active hover:bg-active/10 opacity-0 group-hover:opacity-100 transition-all"
              title="Resume"
            >
              <Play size={15} stroke-width={1.75} />
            </button>
          </Show>

          <Show when={dl().status === "failed"}>
            <button
              onClick={handleRetry}
              class="p-1.5 rounded-md text-error hover:bg-error/10 transition-all"
              title="Retry"
            >
              <RotateCcw size={15} stroke-width={1.75} />
            </button>
          </Show>

          <Show when={dl().status === "completed"}>
            <div class="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={handleOpenFile}
                class="p-1.5 rounded-md text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-all"
                title="Open file"
              >
                <ExternalLink size={15} stroke-width={1.75} />
              </button>
              <button
                onClick={handleOpenFolder}
                class="p-1.5 rounded-md text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-all"
                title="Open folder"
              >
                <FolderOpen size={15} stroke-width={1.75} />
              </button>
              <button
                onClick={handleRedownload}
                class="p-1.5 rounded-md text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-all"
                title="Redownload"
              >
                <RefreshCw size={15} stroke-width={1.75} />
              </button>
            </div>
          </Show>
        </div>
```

Replace the progress bar section with gradient + shimmer:

```tsx
      {/* Progress bar for downloading/paused */}
      <Show when={dl().status === "downloading" || dl().status === "paused" || dl().status === "analyzing"}>
        <div class="mt-2 h-1.5 bg-surface rounded-full overflow-hidden">
          <div
            class={`h-full rounded-full transition-all duration-300 ${
              dl().status === "paused" ? "bg-warning" : "progress-shimmer"
            }`}
            style={{ width: `${percentComplete()}%` }}
          />
        </div>
      </Show>
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

**Step 3: Visual check**

Run: `cargo tauri dev`
Expected: Download cards show icon buttons on hover instead of text. Active progress bars show animated gradient shimmer.

**Step 4: Commit**

Message: `feat(ui): replace download card text buttons with Lucide icon buttons`

---

### Task 5: Replace UrlInput Inline SVGs with Lucide

**Files:**
- Modify: `src/components/UrlInput.tsx`

**Step 1: Add Lucide imports and replace inline SVGs**

Add import at top:

```tsx
import { Settings, FolderOpen } from "lucide-solid";
```

Replace the settings gear button SVG (the `<svg>` inside the options toggle button) with:

```tsx
<Settings size={16} stroke-width={1.75} />
```

Replace the folder browse button SVG (the `<svg>` inside the `selectFolder` button) with:

```tsx
<FolderOpen size={14} stroke-width={2} />
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

**Step 3: Commit**

Message: `feat(ui): replace UrlInput inline SVGs with Lucide icons`

---

### Task 6: Replace CommandPalette Inline SVGs with Lucide

**Files:**
- Modify: `src/components/command-palette/CommandPalette.tsx`

**Step 1: Remove all 7 inline SVG icon functions and replace with Lucide**

Remove the `PlusIcon`, `PauseIcon`, `PlayIcon`, `TrashIcon`, `CogIcon`, `SidebarIcon`, `FolderIcon`, `FileIcon` function components (lines 9-73 approximately).

Add Lucide imports:

```tsx
import {
  Plus,
  Pause,
  Play,
  Trash2,
  Settings,
  PanelLeft,
  FolderOpen,
  File,
  Search,
} from "lucide-solid";
```

Update the static commands array to use Lucide JSX instead of the old icon functions. Each `icon` field becomes e.g. `<Plus size={16} stroke-width={1.75} />` instead of `<PlusIcon />`.

Also replace the inline search SVG icon in the search input row with:
```tsx
<Search size={16} stroke-width={1.75} class="text-text-muted" />
```

The download-item commands in the dynamic list should use:
```tsx
<File size={16} stroke-width={1.75} />
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds. No inline SVG functions remain in this file.

**Step 3: Commit**

Message: `feat(ui): replace command palette inline SVGs with Lucide icons`

---

### Task 7: Replace SettingsPanel Close Button SVG with Lucide

**Files:**
- Modify: `src/components/settings/SettingsPanel.tsx`

**Step 1: Replace inline close button SVG**

Add import:

```tsx
import { X } from "lucide-solid";
```

Replace the 8-line `<svg>` inside the close button with:

```tsx
<X size={18} stroke-width={1.75} />
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

**Step 3: Commit**

Message: `feat(ui): replace settings panel close SVG with Lucide`

---

### Task 8: Replace DetailPanel Inline SVGs with Lucide

**Files:**
- Modify: `src/components/layout/DetailPanel.tsx`

**Step 1: Audit DetailPanel for inline SVGs**

Read the full file and identify all inline `<svg>` elements. Replace each with the corresponding Lucide import. Common ones expected:
- Close/X button → `X`
- Copy URL button → `Copy` or `Clipboard`
- Open file → `ExternalLink`
- Open folder → `FolderOpen`
- Delete → `Trash2`
- Retry → `RotateCcw`
- Redownload → `RefreshCw`

Add all needed Lucide imports at the top.

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

**Step 3: Commit**

Message: `feat(ui): replace detail panel inline SVGs with Lucide icons`

---

### Task 9: Replace FloatingActionBar Text Buttons with Lucide Icon Buttons

**Files:**
- Modify: `src/components/shared/FloatingActionBar.tsx`

**Step 1: Add Lucide icons to action buttons**

Add imports:

```tsx
import { Pause, Play, Trash2, XCircle } from "lucide-solid";
```

Update each button to include an icon alongside or replacing the text:
- Pause → `<Pause size={14} stroke-width={1.75} />` + "Pause" text
- Resume → `<Play size={14} stroke-width={1.75} />` + "Resume" text
- Delete → `<Trash2 size={14} stroke-width={1.75} />` + "Delete" text
- Clear → `<XCircle size={14} stroke-width={1.75} />` + "Clear" text

Add `backdrop-blur-sm` and `bg-surface/90` to the bar container for a frosted glass look.

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

**Step 3: Commit**

Message: `feat(ui): add Lucide icons to floating action bar`

---

### Task 10: Replace DropZone Inline SVG with Lucide

**Files:**
- Modify: `src/components/shared/DropZone.tsx`

**Step 1: Replace the large download SVG icon in the drop overlay**

Add import:

```tsx
import { Download } from "lucide-solid";
```

Replace the inline SVG with:

```tsx
<Download size={48} stroke-width={1.5} class="text-active" />
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

**Step 3: Commit**

Message: `feat(ui): replace drop zone inline SVG with Lucide icon`

---

### Task 11: Add Kobalte Tooltips to Download Card Icon Buttons

**Files:**
- Modify: `src/components/downloads/DownloadCard.tsx`

**Step 1: Replace `title` attributes with Kobalte Tooltip**

Add import:

```tsx
import { Tooltip } from "@kobalte/core/tooltip";
```

Add tooltip CSS (if not already in globals.css — add to `@layer utilities`):

```css
.tooltip-content {
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 11px;
  background: var(--surface);
  color: var(--text-secondary);
  border: 1px solid var(--border);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  animation: tooltip-in 150ms ease-out;
}

@keyframes tooltip-in {
  from { opacity: 0; transform: translateY(2px); }
  to { opacity: 1; transform: translateY(0); }
}
```

Wrap each icon button with Kobalte's Tooltip pattern:

```tsx
<Tooltip openDelay={300}>
  <Tooltip.Trigger
    as="button"
    onClick={handlePause}
    class="p-1.5 rounded-md text-text-secondary hover:text-text-primary hover:bg-surface-hover opacity-0 group-hover:opacity-100 transition-all"
  >
    <PauseIcon size={15} stroke-width={1.75} />
  </Tooltip.Trigger>
  <Tooltip.Portal>
    <Tooltip.Content class="tooltip-content">
      Pause
    </Tooltip.Content>
  </Tooltip.Portal>
</Tooltip>
```

Apply this pattern to all 6 action buttons (Pause, Resume, Retry, Open File, Open Folder, Redownload).

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

**Step 3: Visual check**

Run: `cargo tauri dev`
Expected: Hovering over icon buttons shows animated tooltip after 300ms delay.

**Step 4: Commit**

Message: `feat(ui): add Kobalte tooltips to download card actions`

---

### Task 12: Add Micro-animations & Final Polish

**Files:**
- Modify: `src/styles/globals.css`
- Modify: `src/components/downloads/DownloadCard.tsx`
- Modify: `src/components/shared/FloatingActionBar.tsx`

**Step 1: Add transition utilities to globals.css**

Add to the `@layer utilities` section:

```css
  .animate-slide-in {
    animation: slide-in 200ms ease-out;
  }

  .animate-fade-in {
    animation: fade-in 150ms ease-out;
  }
}

@keyframes slide-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
```

**Step 2: Apply animations**

- DownloadCard: Add `animate-slide-in` class to the root div (cards animate in when they appear)
- FloatingActionBar: Add `animate-fade-in` to the action bar container (fades in when selection changes)

**Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds.

**Step 4: Visual check**

Run: `cargo tauri dev`
Expected: New downloads slide in smoothly, floating action bar fades in on selection.

**Step 5: Commit**

Message: `feat(ui): add slide-in and fade-in micro-animations`

---

### Task 13: Full Integration Verification

**Step 1: Run full build**

Run: `npm run build`
Expected: Clean build, no TypeScript errors.

**Step 2: Run Rust checks**

Run: `cargo check --workspace`
Expected: Pass (no Rust changes in this plan).

**Step 3: Visual smoke test**

Run: `cargo tauri dev`

Verify:
- [ ] App launches with darker background and vivid accent colors
- [ ] Sidebar shows Lucide icons with active indicator bar
- [ ] Download cards show icon buttons on hover
- [ ] Active downloads show shimmer gradient progress bar
- [ ] Paused downloads show solid warning progress bar
- [ ] Tooltips appear on icon button hover
- [ ] Command palette shows Lucide icons
- [ ] Settings panel close button is Lucide X
- [ ] Floating action bar has icons + frosted glass
- [ ] Drop zone shows Lucide download icon
- [ ] New downloads animate in with slide-in
- [ ] Light theme still works (switch in settings)

**Step 4: Final commit if any fixes needed**

Message: `fix(ui): polish UI overhaul integration issues`
