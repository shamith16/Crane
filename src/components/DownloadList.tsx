import { For, Show, createSignal, createMemo, createEffect, onMount, onCleanup } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { getDownloads, subscribeProgress } from "../lib/commands";
import type { Download, DownloadProgress } from "../lib/types";
import { statusFilter, categoryFilter, setVisibleDownloadIds } from "../stores/ui";
import DownloadRow from "./downloads/DownloadRow";
import MaterialIcon from "./shared/MaterialIcon";
import FloatingActionBar from "./shared/FloatingActionBar";

// ─── Group definitions ──────────────────────────

interface DownloadGroup {
  key: string;
  label: string;
  downloads: Download[];
  collapsible: boolean;
}

const GROUP_ORDER = ["active", "queued", "completed", "failed"] as const;

function groupDownloads(downloads: Download[]): DownloadGroup[] {
  const buckets: Record<string, Download[]> = {
    active: [],
    queued: [],
    completed: [],
    failed: [],
  };

  for (const dl of downloads) {
    switch (dl.status) {
      case "downloading":
      case "analyzing":
      case "paused":
      case "pending":
        buckets.active.push(dl);
        break;
      case "queued":
        buckets.queued.push(dl);
        break;
      case "completed":
        buckets.completed.push(dl);
        break;
      case "failed":
        buckets.failed.push(dl);
        break;
    }
  }

  const groups: DownloadGroup[] = [];
  for (const key of GROUP_ORDER) {
    if (buckets[key].length > 0) {
      groups.push({
        key,
        label: groupLabel(key, buckets[key].length),
        downloads: buckets[key],
        collapsible: key === "completed" || key === "failed",
      });
    }
  }
  return groups;
}

function groupLabel(key: string, count: number): string {
  switch (key) {
    case "active":
      return `Active (${count})`;
    case "queued":
      return `Queued (${count})`;
    case "completed":
      return `Completed (${count})`;
    case "failed":
      return `Failed (${count})`;
    default:
      return key;
  }
}

// ─── Component ──────────────────────────────────

interface Props {
  refreshTrigger: number;
  onDownloadsLoaded?: (downloads: Download[]) => void;
  onProgressUpdate?: (map: Record<string, DownloadProgress>) => void;
}

export default function DownloadList(props: Props) {
  const [downloads, setDownloads] = createStore<Download[]>([]);
  const [progressMap, setProgressMap] = createSignal<Record<string, DownloadProgress>>({});
  const [collapsedGroups, setCollapsedGroups] = createSignal<Set<string>>(new Set());
  let pollInterval: ReturnType<typeof setInterval>;
  const subscribedIds = new Set<string>();

  // ─── Data fetching ────────────────────────────

  async function refresh() {
    try {
      const list = await getDownloads();
      setDownloads(reconcile(list, { key: "id", merge: false }));
      props.onDownloadsLoaded?.(list);

      // Subscribe to progress for active downloads
      for (const dl of list) {
        if (dl.status === "downloading" && !subscribedIds.has(dl.id)) {
          subscribedIds.add(dl.id);
          subscribeProgress(dl.id, (progress) => {
            setProgressMap((prev) => ({ ...prev, [progress.download_id]: progress }));
          });
        }
      }
    } catch (e) {
      console.error("Failed to fetch downloads:", e);
    }
  }

  onMount(() => {
    refresh();
    pollInterval = setInterval(refresh, 2000);
  });

  onCleanup(() => {
    clearInterval(pollInterval);
  });

  // Re-fetch when refreshTrigger changes
  createEffect(() => {
    props.refreshTrigger; // reactive dependency
    refresh();
  });

  // ─── Filtering ────────────────────────────────

  const filteredDownloads = createMemo(() => {
    let list = [...downloads];

    const sf = statusFilter();
    if (sf !== "all") {
      list = list.filter((dl) => dl.status === sf);
    }

    const cf = categoryFilter();
    if (cf !== "all") {
      list = list.filter((dl) => dl.category === cf);
    }

    return list;
  });

  // ─── Grouping ─────────────────────────────────

  const groups = createMemo(() => groupDownloads(filteredDownloads()));

  // Flat list of visible IDs for shift-click range selection
  const visibleIds = createMemo(() => {
    const ids: string[] = [];
    for (const group of groups()) {
      if (!collapsedGroups().has(group.key)) {
        for (const dl of group.downloads) {
          ids.push(dl.id);
        }
      }
    }
    return ids;
  });

  // Sync visible IDs to store for Cmd+A
  createEffect(() => {
    setVisibleDownloadIds(visibleIds());
  });

  // Forward progressMap to parent
  createEffect(() => {
    props.onProgressUpdate?.(progressMap());
  });

  // ─── Group collapse ───────────────────────────

  function toggleGroupCollapse(key: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // ─── Render ───────────────────────────────────

  return (
    <div class="flex-1 overflow-y-auto relative">
      <Show
        when={filteredDownloads().length > 0}
        fallback={
          <div class="flex items-center justify-center h-full">
            <p class="text-sm text-text-muted">
              {downloads.length === 0
                ? "No downloads yet. Paste a URL above to start."
                : "No downloads match the current filter."}
            </p>
          </div>
        }
      >
        <div class="p-5 space-y-5">
          <For each={groups()}>
            {(group) => {
              const isCollapsed = () => collapsedGroups().has(group.key);

              return (
                <div>
                  {/* Group header */}
                  <Show
                    when={group.collapsible}
                    fallback={
                      <div class="flex items-center gap-1.5 w-full py-2 text-xs font-semibold text-text-muted select-none">
                        <span class="uppercase tracking-widest text-[10px]">{group.label}</span>
                      </div>
                    }
                  >
                    <button
                      class="flex items-center gap-1 w-full py-2 text-xs font-semibold text-text-muted hover:text-text-secondary transition-colors select-none"
                      onClick={() => toggleGroupCollapse(group.key)}
                      aria-expanded={!isCollapsed()}
                    >
                      {isCollapsed()
                        ? <MaterialIcon name="chevron_right" size={16} />
                        : <MaterialIcon name="expand_more" size={16} />}
                      <span class="uppercase tracking-widest text-[10px]">{group.label}</span>
                    </button>
                  </Show>

                  {/* Group items — card grid */}
                  <Show when={!isCollapsed()}>
                    <div class="space-y-1">
                      <For each={group.downloads}>
                        {(dl) => (
                          <DownloadRow
                            download={dl}
                            progress={progressMap()[dl.id]}
                            onRefresh={refresh}
                            visibleIds={visibleIds()}
                          />
                        )}
                      </For>
                    </div>
                  </Show>
                </div>
              );
            }}
          </For>
        </div>
      </Show>

      {/* Floating action bar for multi-select */}
      <FloatingActionBar onRefresh={refresh} />
    </div>
  );
}
