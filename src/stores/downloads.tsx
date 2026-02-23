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

interface DownloadStore {
  state: DownloadStoreState;
  /** Grouped by status in display order */
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
  /** Currently selected download ID */
  selectedDownloadId: () => string | null;
  /** Set the selected download */
  selectDownload: (id: string | null) => void;
  /** The selected download (effective, with progress overlay) */
  selectedDownload: () => Download | null;
  /** Get live progress for a download */
  getProgress: (id: string) => DownloadProgress | undefined;
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
  const [selectedDownloadId, setSelectedDownloadId] = createSignal<string | null>(null);

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
    for (const [id] of activeChannels) {
      if (!activeIds.has(id)) {
        activeChannels.delete(id);
        // Channel will be GC'd, backend detects send failure and stops
        setState("progress", id, undefined!);
      }
    }

    // Subscribe to new active downloads
    for (const id of activeIds) {
      if (!activeChannels.has(id)) {
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

  const downloadsByStatus = () =>
    STATUS_ORDER.map((group) => ({
      key: group.key,
      label: group.label,
      items: state.downloads.filter((d) => d.status === group.key),
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

  const selectDownload = (id: string | null) => setSelectedDownloadId(id);

  const selectedDownload = (): Download | null => {
    const id = selectedDownloadId();
    if (!id) return null;
    const dl = state.downloads.find((d) => d.id === id);
    if (!dl) return null;
    return getEffective(dl);
  };

  const getProgress = (id: string): DownloadProgress | undefined => state.progress[id];

  const store: DownloadStore = {
    state,
    downloadsByStatus,
    statusCounts,
    categoryCounts,
    hasDownloads,
    totalSpeed,
    activeCount,
    getEffective,
    selectedDownloadId,
    selectDownload,
    selectedDownload,
    getProgress,
  };

  return (
    <DownloadStoreContext.Provider value={store}>
      {props.children}
    </DownloadStoreContext.Provider>
  );
};
