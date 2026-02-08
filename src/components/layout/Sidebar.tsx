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

interface Props {
  downloads: Download[];
}

const STATUS_FILTERS: { key: StatusFilter; label: string; icon: string }[] = [
  { key: "all", label: "All Downloads", icon: "\u2193" },
  { key: "downloading", label: "Active", icon: "\u25B6" },
  { key: "queued", label: "Queued", icon: "\u23F3" },
  { key: "completed", label: "Completed", icon: "\u2713" },
  { key: "failed", label: "Failed", icon: "\u2715" },
  { key: "paused", label: "Paused", icon: "\u23F8" },
];

const CATEGORY_FILTERS: { key: CategoryFilter; label: string; icon: string }[] = [
  { key: "all", label: "All Types", icon: "\u25FB" },
  { key: "documents", label: "Documents", icon: "\uD83D\uDCC4" },
  { key: "video", label: "Video", icon: "\uD83C\uDFAC" },
  { key: "audio", label: "Audio", icon: "\uD83C\uDFB5" },
  { key: "images", label: "Images", icon: "\uD83D\uDDBC" },
  { key: "archives", label: "Archives", icon: "\uD83D\uDCE6" },
  { key: "software", label: "Software", icon: "\uD83D\uDCBF" },
  { key: "other", label: "Other", icon: "\u25EF" },
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
        class="flex items-center justify-center h-8 mt-1 mx-1 rounded hover:bg-surface-hover text-text-muted text-xs"
        title={collapsed() ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed() ? "\u25B6" : "\u25C0"}
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
                    ? "bg-surface-hover text-text-primary"
                    : "text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                } ${collapsed() ? "justify-center" : "gap-2"}`}
                title={collapsed() ? `${filter.label} (${count()})` : undefined}
              >
                <span class="flex-shrink-0 w-4 text-center">{filter.icon}</span>
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
                    ? "bg-surface-hover text-text-primary"
                    : "text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                } ${collapsed() ? "justify-center" : "gap-2"}`}
                title={collapsed() ? `${filter.label} (${count()})` : undefined}
              >
                <span class="flex-shrink-0 w-4 text-center">{filter.icon}</span>
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
