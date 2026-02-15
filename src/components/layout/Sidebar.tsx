import { For, Show, createMemo } from "solid-js";
import type { JSX } from "solid-js";
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
  Image as ImageIcon,
  Archive,
  Box,
  File,
} from "lucide-solid";

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
        collapsed() ? "w-14 cursor-pointer" : "w-52"
      }`}
      onClick={collapsed() ? toggleSidebar : undefined}
    >
      {/* Status filters */}
      <div class="mt-3 px-2">
        <Show when={!collapsed()}>
          <p class="px-2 mb-2 text-[10px] uppercase tracking-widest text-text-muted font-semibold">
            Status
          </p>
        </Show>
        <div class="space-y-0.5">
          <For each={STATUS_FILTERS}>
            {(filter) => {
              const count = () => statusCounts()[filter.key] || 0;
              const active = () => statusFilter() === filter.key;

              return (
                <button
                  onClick={(e) => {
                    if (collapsed()) { e.stopPropagation(); toggleSidebar(); }
                    setStatusFilter(filter.key);
                  }}
                  class={`flex items-center w-full rounded-lg text-xs transition-colors ${
                    active()
                      ? "bg-active/10 text-active font-medium"
                      : "text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                  } ${collapsed() ? "justify-center p-2.5" : "gap-2.5 px-2.5 py-2"}`}
                  title={collapsed() ? `${filter.label} (${count()})` : undefined}
                >
                  <span class="flex-shrink-0 w-5 flex items-center justify-center">{filter.icon()}</span>
                  <Show when={!collapsed()}>
                    <span class="flex-1 text-left truncate">{filter.label}</span>
                    <span class="text-text-muted tabular-nums text-[11px]">{count()}</span>
                  </Show>
                </button>
              );
            }}
          </For>
        </div>
      </div>

      {/* Category filters */}
      <div class="mt-5 px-2">
        <Show when={!collapsed()}>
          <p class="px-2 mb-2 text-[10px] uppercase tracking-widest text-text-muted font-semibold">
            Category
          </p>
        </Show>
        <div class="space-y-0.5">
          <For each={CATEGORY_FILTERS}>
            {(filter) => {
              const count = () => categoryCounts()[filter.key] || 0;
              const active = () => categoryFilter() === filter.key;

              return (
                <button
                  onClick={(e) => {
                    if (collapsed()) { e.stopPropagation(); toggleSidebar(); }
                    setCategoryFilter(filter.key);
                  }}
                  class={`flex items-center w-full rounded-lg text-xs transition-colors ${
                    active()
                      ? "bg-active/10 text-active font-medium"
                      : "text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                  } ${collapsed() ? "justify-center p-2.5" : "gap-2.5 px-2.5 py-2"}`}
                  title={collapsed() ? `${filter.label} (${count()})` : undefined}
                >
                  <span class="flex-shrink-0 w-5 flex items-center justify-center">{filter.icon()}</span>
                  <Show when={!collapsed()}>
                    <span class="flex-1 text-left truncate">{filter.label}</span>
                    <span class="text-text-muted tabular-nums text-[11px]">{count()}</span>
                  </Show>
                </button>
              );
            }}
          </For>
        </div>
      </div>
    </div>
  );
}
