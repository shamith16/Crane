import { For, Show, createMemo, createSignal, onMount, onCleanup } from "solid-js";
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
import { getDiskSpace } from "../../lib/commands";
import { formatSize } from "../../lib/format";
import MaterialIcon from "../shared/MaterialIcon";

interface Props {
  downloads: Download[];
}

const STATUS_FILTERS: { key: StatusFilter; label: string; icon: string }[] = [
  { key: "all", label: "All Downloads", icon: "download" },
  { key: "downloading", label: "Active", icon: "play_arrow" },
  { key: "queued", label: "Queued", icon: "hourglass_empty" },
  { key: "completed", label: "Completed", icon: "check_circle" },
  { key: "failed", label: "Failed", icon: "error" },
  { key: "paused", label: "Paused", icon: "pause" },
];

const CATEGORY_FILTERS: { key: CategoryFilter; label: string; icon: string }[] = [
  { key: "all", label: "All Types", icon: "insert_drive_file" },
  { key: "documents", label: "Documents", icon: "description" },
  { key: "video", label: "Video", icon: "movie" },
  { key: "audio", label: "Audio", icon: "music_note" },
  { key: "images", label: "Images", icon: "image" },
  { key: "archives", label: "Archives", icon: "archive" },
  { key: "software", label: "Software", icon: "widgets" },
  { key: "other", label: "Other", icon: "insert_drive_file" },
];

export default function Sidebar(props: Props) {
  const [diskFree, setDiskFree] = createSignal<number | null>(null);
  const [diskTotal, setDiskTotal] = createSignal<number | null>(null);

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

  // Disk usage polling
  onMount(() => {
    function fetchDisk() {
      getDiskSpace().then((ds) => {
        setDiskFree(ds.free_bytes);
        setDiskTotal(ds.total_bytes);
      }).catch(() => {});
    }
    fetchDisk();
    const interval = setInterval(fetchDisk, 30_000);
    onCleanup(() => clearInterval(interval));
  });

  const diskPercent = createMemo(() => {
    const free = diskFree();
    const total = diskTotal();
    if (free === null || total === null || total === 0) return 0;
    return Math.round(((total - free) / total) * 100);
  });

  return (
    <div
      class={`flex-shrink-0 bg-surface border-r border-border flex flex-col transition-all duration-200 overflow-y-auto overflow-x-hidden ${
        collapsed() ? "w-14 cursor-pointer" : "w-[280px]"
      }`}
      onClick={collapsed() ? toggleSidebar : undefined}
    >
      {/* Status filters */}
      <div class="mt-3 px-3">
        <Show when={!collapsed()}>
          <p class="px-3 mb-2 text-[11px] uppercase tracking-wider text-text-secondary font-semibold">
            Status
          </p>
        </Show>
        <div class="space-y-1">
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
                  class={`flex items-center w-full rounded-md text-[13px] transition-colors ${
                    active()
                      ? "bg-active/10 text-active font-medium"
                      : "text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                  } ${collapsed() ? "justify-center p-2.5" : "gap-2.5 px-3 py-2"}`}
                  title={collapsed() ? `${filter.label} (${count()})` : undefined}
                >
                  <span class="flex-shrink-0 w-5 flex items-center justify-center">
                    <MaterialIcon name={filter.icon} size={18} />
                  </span>
                  <Show when={!collapsed()}>
                    <span class="flex-1 text-left truncate">{filter.label}</span>
                    <span class="text-text-muted tabular-nums text-[13px] font-semibold">{count()}</span>
                  </Show>
                </button>
              );
            }}
          </For>
        </div>
      </div>

      {/* Category filters */}
      <div class="mt-5 px-3">
        <Show when={!collapsed()}>
          <p class="px-3 mb-2 text-[11px] uppercase tracking-wider text-text-secondary font-semibold">
            File Types
          </p>
        </Show>
        <div class="space-y-1">
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
                  class={`flex items-center w-full rounded-md text-[13px] transition-colors ${
                    active()
                      ? "bg-active/10 text-active font-medium"
                      : "text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                  } ${collapsed() ? "justify-center p-2.5" : "gap-2.5 px-3 py-2"}`}
                  title={collapsed() ? `${filter.label} (${count()})` : undefined}
                >
                  <span class="flex-shrink-0 w-5 flex items-center justify-center">
                    <MaterialIcon name={filter.icon} size={18} />
                  </span>
                  <Show when={!collapsed()}>
                    <span class="flex-1 text-left truncate">{filter.label}</span>
                    <span class="text-text-muted tabular-nums text-[13px]">{count()}</span>
                  </Show>
                </button>
              );
            }}
          </For>
        </div>
      </div>

      {/* Disk Usage */}
      <Show when={!collapsed() && diskTotal() !== null}>
        <div class="mt-auto px-3 pb-4">
          <div class="bg-surface-hover rounded-lg p-4">
            <p class="text-[11px] uppercase tracking-wider text-text-secondary font-semibold mb-3">
              Disk Usage {diskPercent()}%
            </p>
            <div class="w-full h-2 bg-border rounded-full overflow-hidden mb-2">
              <div
                class="h-full rounded-full"
                style={{
                  width: `${diskPercent()}%`,
                  background: `linear-gradient(90deg, var(--warning), var(--error))`,
                }}
              />
            </div>
            <p class="text-[12px] text-text-secondary">
              {diskFree() !== null ? formatSize(diskFree()!) : "\u2014"} free
              {diskTotal() !== null ? ` of ${formatSize(diskTotal()!)}` : ""}
            </p>
          </div>
        </div>
      </Show>
    </div>
  );
}
