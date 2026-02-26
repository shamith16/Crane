import { createContext, createSignal, useContext, type ParentComponent } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { isTauri, getDownloads, subscribeProgress } from "../lib/tauri";
import { mockDownloads } from "../data/mockDownloads";
import type {
  Download,
  DownloadProgress,
  DownloadStatus,
  FileCategory,
} from "../types/download";

// ── Store shape ────────────────────────────────

interface DownloadStoreState {
  downloads: Download[];
  progress: Record<string, DownloadProgress>;
  loading: boolean;
  error: string | null;
}

interface DownloadStoreActions {
  /** Merged view: base download + live progress overlay */
  getEffective(download: Download): Download;
}

export type FilterType = "status" | "category";
export type FilterValue = string;

interface DownloadStore {
  state: DownloadStoreState;
  /** Current active filter */
  activeFilter: () => { type: FilterType; value: FilterValue };
  /** Set the active filter */
  setActiveFilter: (type: FilterType, value: FilterValue) => void;
  /** Grouped by status in display order, respecting active filter */
  downloadsByStatus: () => { key: string; label: string; items: Download[] }[];
  /** Counts per status for sidebar badges */
  statusCounts: () => Record<string, number>;
  /** Counts per category for sidebar badges */
  categoryCounts: () => Record<string, number>;
  /** Whether any downloads exist */
  hasDownloads: () => boolean;
  /** Total active speed across all downloads */
  totalSpeed: () => number;
  /** Active download count */
  activeCount: () => number;
  /** Get effective download with progress overlay */
  getEffective: DownloadStoreActions["getEffective"];
  /** Set of selected download IDs */
  selectedIds: () => Set<string>;
  /** Single-select: clears others, sets one, opens detail */
  selectOne: (id: string | null) => void;
  /** Toggle a single ID in/out of selection (Ctrl+click) */
  toggleSelect: (id: string) => void;
  /** Range select from last-clicked to target (Shift+click) */
  rangeSelect: (id: string) => void;
  /** Clear all selection */
  clearSelection: () => void;
  /** The single selected download for detail panel (only when exactly 1) */
  selectedDownload: () => Download | null;
  /** All selected downloads (effective) */
  selectedDownloads: () => Download[];
  /** Get live progress for a download */
  getProgress: (id: string) => DownloadProgress | undefined;
  /** Force immediate refresh of downloads from backend */
  refreshDownloads: () => void;
  /** Select all downloads in current filtered view */
  selectAll: () => void;
  /** Flat ordered ID array matching visual display order (for arrow key nav) */
  flatDisplayIds: () => string[];
}

// ── Status display order ───────────────────────

const STATUS_ORDER: { key: DownloadStatus; label: string }[] = [
  { key: "downloading", label: "Active" },
  { key: "analyzing", label: "Analyzing" },
  { key: "paused", label: "Paused" },
  { key: "queued", label: "Queued" },
  { key: "failed", label: "Failed" },
  { key: "completed", label: "Completed" },
];

// ── Context ────────────────────────────────────

const DownloadStoreContext = createContext<DownloadStore>();

export const useDownloads = (): DownloadStore => {
  const ctx = useContext(DownloadStoreContext);
  if (!ctx) throw new Error("useDownloads must be used within DownloadStoreProvider");
  return ctx;
};

// ── Provider ───────────────────────────────────

export const DownloadStoreProvider: ParentComponent = (props) => {
  const [selectedIds, setSelectedIds] = createSignal<Set<string>>(new Set());
  const [activeFilter, setActiveFilterRaw] = createSignal<{ type: FilterType; value: FilterValue }>({
    type: "status",
    value: "all",
  });
  let lastClickedId: string | null = null;

  const [state, setState] = createStore<DownloadStoreState>({
    downloads: [],
    progress: {},
    loading: true,
    error: null,
  });

  // Track active channel references so they don't get GC'd
  const activeChannels = new Map<string, ReturnType<typeof subscribeProgress>>();

  // ── Fetch downloads ──────────────────────────

  async function fetchDownloads() {
    try {
      const downloads = await getDownloads();
      setState("downloads", reconcile(downloads));
      setState("error", null);
      manageProgressChannels(downloads);
    } catch (e) {
      setState("error", String(e));
    } finally {
      setState("loading", false);
    }
  }

  // ── Progress channel management ──────────────

  function manageProgressChannels(downloads: Download[]) {
    const activeIds = new Set(
      downloads
        .filter((d) => d.status === "downloading" || d.status === "analyzing")
        .map((d) => d.id),
    );

    // Unsubscribe from downloads that are no longer active
    const terminalIds = new Set(
      downloads.filter((d) => d.status === "completed" || d.status === "failed").map((d) => d.id),
    );
    for (const [id] of activeChannels) {
      if (!activeIds.has(id)) {
        activeChannels.delete(id);
        // Only clear progress for terminal states — paused/queued keep last snapshot
        if (terminalIds.has(id)) {
          setState("progress", id, undefined!);
        }
      }
    }

    // Subscribe to new active downloads
    for (const id of activeIds) {
      if (!activeChannels.has(id)) {
        // Keep existing progress snapshot visible until the new channel
        // delivers its first tick — avoids flashing 0% on resume
        const channel = subscribeProgress(id, (progress) => {
          setState("progress", id, progress);
        });
        activeChannels.set(id, channel);
      }
    }
  }

  // ── Initialize ───────────────────────────────

  if (isTauri()) {
    fetchDownloads();
    // Periodic refresh to catch new downloads (from extension) and status changes
    setInterval(fetchDownloads, 5000);
  } else {
    // Browser dev mode — use mock data
    setState("downloads", mockDownloads);
    setState("loading", false);
  }

  // ── Computed values ──────────────────────────

  const getEffective = (download: Download): Download => {
    const p = state.progress[download.id];
    if (!p) return download;
    return {
      ...download,
      downloaded_size: p.downloaded_size,
      total_size: p.total_size ?? download.total_size,
      speed: p.speed,
    };
  };

  const setActiveFilter = (type: FilterType, value: FilterValue) => {
    setActiveFilterRaw({ type, value });
  };

  const filteredDownloads = () => {
    const filter = activeFilter();
    if (filter.type === "status") {
      if (filter.value === "all") return state.downloads;
      if (filter.value === "active") {
        return state.downloads.filter(
          (d) => d.status === "downloading" || d.status === "analyzing",
        );
      }
      return state.downloads.filter((d) => d.status === filter.value);
    }
    // category filter
    return state.downloads.filter((d) => d.category === filter.value);
  };

  const downloadsByStatus = () =>
    STATUS_ORDER.map((group) => ({
      key: group.key,
      label: group.label,
      items: filteredDownloads().filter((d) => d.status === group.key),
    })).filter((group) => group.items.length > 0);

  const statusCounts = () => {
    const counts: Record<string, number> = {
      all: state.downloads.length,
      active: 0,
      queued: 0,
      completed: 0,
      failed: 0,
      paused: 0,
    };
    for (const d of state.downloads) {
      if (d.status === "downloading" || d.status === "analyzing") counts.active++;
      else if (d.status === "queued") counts.queued++;
      else if (d.status === "completed") counts.completed++;
      else if (d.status === "failed") counts.failed++;
      else if (d.status === "paused") counts.paused++;
    }
    return counts;
  };

  const categoryCounts = () => {
    const counts: Record<FileCategory, number> = {
      documents: 0,
      video: 0,
      audio: 0,
      images: 0,
      archives: 0,
      software: 0,
      other: 0,
    };
    for (const d of state.downloads) {
      counts[d.category]++;
    }
    return counts;
  };

  const hasDownloads = () => state.downloads.length > 0;

  const totalSpeed = () => {
    let total = 0;
    for (const d of state.downloads) {
      if (d.status === "downloading") {
        const p = state.progress[d.id];
        total += p ? p.speed : d.speed;
      }
    }
    return total;
  };

  const activeCount = () =>
    state.downloads.filter(
      (d) => d.status === "downloading" || d.status === "analyzing",
    ).length;

  const selectOne = (id: string | null) => {
    if (id) {
      setSelectedIds(new Set([id]));
      lastClickedId = id;
    } else {
      setSelectedIds(new Set<string>());
      lastClickedId = null;
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set<string>(selectedIds());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
    lastClickedId = id;
  };

  const rangeSelect = (id: string) => {
    if (!lastClickedId) {
      selectOne(id);
      return;
    }
    // Build flat ordered list of IDs from downloadsByStatus
    const flatIds = state.downloads.map((d) => d.id);
    const fromIdx = flatIds.indexOf(lastClickedId);
    const toIdx = flatIds.indexOf(id);
    if (fromIdx === -1 || toIdx === -1) {
      selectOne(id);
      return;
    }
    const start = Math.min(fromIdx, toIdx);
    const end = Math.max(fromIdx, toIdx);
    const next = new Set<string>(selectedIds());
    for (let i = start; i <= end; i++) next.add(flatIds[i]);
    setSelectedIds(next);
  };

  const clearSelection = () => {
    setSelectedIds(new Set<string>());
    lastClickedId = null;
  };

  const selectedDownload = (): Download | null => {
    const ids = selectedIds();
    if (ids.size !== 1) return null;
    const id = ids.values().next().value!;
    return state.downloads.find((d) => d.id === id) ?? null;
  };

  const selectedDownloads = (): Download[] => {
    const ids = selectedIds();
    return state.downloads.filter((d) => ids.has(d.id));
  };

  const getProgress = (id: string): DownloadProgress | undefined => state.progress[id];

  const refreshDownloads = () => {
    if (isTauri()) fetchDownloads();
  };

  const selectAll = () => {
    const ids = new Set(filteredDownloads().map((d) => d.id));
    setSelectedIds(ids);
  };

  const flatDisplayIds = (): string[] =>
    downloadsByStatus().flatMap((group) => group.items.map((d) => d.id));

  const store: DownloadStore = {
    state,
    activeFilter,
    setActiveFilter,
    downloadsByStatus,
    statusCounts,
    categoryCounts,
    hasDownloads,
    totalSpeed,
    activeCount,
    getEffective,
    selectedIds,
    selectOne,
    toggleSelect,
    rangeSelect,
    clearSelection,
    selectedDownload,
    selectedDownloads,
    getProgress,
    refreshDownloads,
    selectAll,
    flatDisplayIds,
  };

  return (
    <DownloadStoreContext.Provider value={store}>
      {props.children}
    </DownloadStoreContext.Provider>
  );
};
