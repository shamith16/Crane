import { createSignal } from "solid-js";

// Sidebar state
const [sidebarCollapsed, setSidebarCollapsed] = createSignal(false);
export { sidebarCollapsed, setSidebarCollapsed };

export function toggleSidebar() {
  setSidebarCollapsed((v) => !v);
}

// Active filter
export type StatusFilter = "all" | "downloading" | "queued" | "completed" | "failed" | "paused";
export type CategoryFilter = "all" | "documents" | "video" | "audio" | "images" | "archives" | "software" | "other";

const [statusFilter, setStatusFilter] = createSignal<StatusFilter>("all");
const [categoryFilter, setCategoryFilter] = createSignal<CategoryFilter>("all");
export { statusFilter, setStatusFilter, categoryFilter, setCategoryFilter };

// Selected download (for detail panel)
const [selectedDownloadId, setSelectedDownloadId] = createSignal<string | null>(null);
export { selectedDownloadId, setSelectedDownloadId };

export function closeDetailPanel() {
  setSelectedDownloadId(null);
}

// Settings panel
const [settingsOpen, setSettingsOpen] = createSignal(false);
export { settingsOpen, setSettingsOpen };

// Command palette
const [commandPaletteOpen, setCommandPaletteOpen] = createSignal(false);
export { commandPaletteOpen, setCommandPaletteOpen };

// Multi-select
const [selectedIds, setSelectedIds] = createSignal<Set<string>>(new Set());
export { selectedIds, setSelectedIds };

export function toggleSelection(id: string, event?: MouseEvent) {
  setSelectedIds((prev) => {
    const next = new Set(prev);
    if (event?.metaKey || event?.ctrlKey) {
      if (next.has(id)) next.delete(id);
      else next.add(id);
    } else {
      next.clear();
      next.add(id);
    }
    return next;
  });
}

export function clearSelection() {
  setSelectedIds(new Set<string>());
}

export function selectAll(ids: string[]) {
  setSelectedIds(new Set(ids));
}

// Visible download IDs (set by DownloadList, read by useKeyboard for Cmd+A)
const [visibleDownloadIds, setVisibleDownloadIds] = createSignal<string[]>([]);
export { visibleDownloadIds, setVisibleDownloadIds };
