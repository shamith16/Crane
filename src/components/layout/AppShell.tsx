import { Show, onMount, onCleanup, type Component } from "solid-js";
import { useLayout } from "./LayoutContext";
import { useDownloads } from "../../stores/downloads";
import {
  isTauri,
  pauseDownload,
  resumeDownload,
  retryDownload,
  deleteDownload,
  openFile,
  openFolder,
} from "../../lib/tauri";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import ContentArea from "./ContentArea";
import DetailPanel from "./DetailPanel";
import StatusBar from "./StatusBar";
import SettingsPage from "../settings/SettingsPage";

const AppShell: Component = () => {
  const layout = useLayout();
  const store = useDownloads();

  const showDetailPanel = () =>
    layout.detailPanelVisible() && store.selectedIds().size === 1 && layout.currentPage() === "downloads";
  const settingsOpen = () => layout.currentPage() === "settings";

  const handleKeyDown = (e: KeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey;
    const tag = (e.target as HTMLElement)?.tagName;
    const isEditable =
      tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable;

    // ── Settings overlay: only Esc and Cmd+, ──
    if (settingsOpen()) {
      if (e.key === "Escape") {
        e.preventDefault();
        layout.setCurrentPage("downloads");
        return;
      }
      if (mod && e.key === ",") {
        e.preventDefault();
        layout.setCurrentPage("downloads");
        return;
      }
      return; // block everything else while settings open
    }

    // ── Cmd+, toggle settings (always allowed) ──
    if (mod && e.key === ",") {
      e.preventDefault();
      layout.setCurrentPage("settings");
      return;
    }

    // ── Cmd combos (allowed even in input fields) ──
    if (mod) {
      switch (e.key.toLowerCase()) {
        case "n":
        case "f":
          e.preventDefault();
          document.querySelector<HTMLInputElement>("[data-url-input]")?.focus();
          return;
        case "b":
          e.preventDefault();
          layout.toggleSidebar();
          return;
        case "a":
          if (!isEditable) {
            e.preventDefault();
            store.selectAll();
          }
          return;
        case "c":
          if (!isEditable && store.selectedIds().size > 0) {
            e.preventDefault();
            const downloads = store.selectedDownloads();
            const urls = downloads.map((d) => d.url).join("\n");
            navigator.clipboard.writeText(urls);
          }
          return;
        case "r":
          if (!isEditable) {
            e.preventDefault();
            const failed = store.selectedDownloads().filter((d) => d.status === "failed");
            if (isTauri() && failed.length > 0) {
              Promise.all(failed.map((d) => retryDownload(d.id))).then(() => store.refreshDownloads());
            }
          }
          return;
        case "enter":
          if (!isEditable && store.selectedIds().size === 1) {
            e.preventDefault();
            const dl = store.selectedDownload();
            if (dl?.status === "completed" && isTauri()) openFolder(dl.id);
          }
          return;
      }
      return;
    }

    // ── Non-mod shortcuts: block when editing text ──
    if (isEditable) return;

    switch (e.key) {
      case "Escape":
        e.preventDefault();
        if (layout.detailPanelVisible()) {
          layout.setDetailPanelVisible(false);
        }
        store.clearSelection();
        return;

      case " ":
        e.preventDefault();
        if (isTauri()) {
          const downloads = store.selectedDownloads();
          const promises = downloads.map((d) => {
            if (d.status === "downloading" || d.status === "analyzing") return pauseDownload(d.id);
            if (d.status === "paused") return resumeDownload(d.id);
            return Promise.resolve();
          });
          Promise.all(promises).then(() => store.refreshDownloads());
        }
        return;

      case "Backspace":
        e.preventDefault();
        if (isTauri() && store.selectedIds().size > 0) {
          const ids = [...store.selectedIds()];
          Promise.all(ids.map((id) => deleteDownload(id, false))).then(() => {
            store.clearSelection();
            store.refreshDownloads();
          });
        }
        return;

      case "Enter":
        e.preventDefault();
        if (store.selectedIds().size === 1) {
          const dl = store.selectedDownload();
          if (dl?.status === "completed" && isTauri()) openFile(dl.id);
        }
        return;

      case "ArrowUp":
      case "ArrowDown": {
        e.preventDefault();
        const ids = store.flatDisplayIds();
        if (ids.length === 0) return;
        const selected = store.selectedIds();
        const direction = e.key === "ArrowDown" ? 1 : -1;

        if (e.shiftKey) {
          // Extend selection
          if (selected.size === 0) {
            store.selectOne(ids[0]);
            return;
          }
          // Find the boundary of current selection in display order
          let lastIdx = -1;
          for (let i = 0; i < ids.length; i++) {
            if (selected.has(ids[i])) lastIdx = i;
          }
          if (direction === -1) {
            // Find first selected
            let firstIdx = ids.length;
            for (let i = 0; i < ids.length; i++) {
              if (selected.has(ids[i])) { firstIdx = i; break; }
            }
            const nextIdx = firstIdx + direction;
            if (nextIdx >= 0) store.toggleSelect(ids[nextIdx]);
          } else {
            const nextIdx = lastIdx + direction;
            if (nextIdx < ids.length) store.toggleSelect(ids[nextIdx]);
          }
        } else {
          // Single move
          if (selected.size === 0) {
            store.selectOne(ids[direction === 1 ? 0 : ids.length - 1]);
          } else {
            // Find current position (use last selected in display order)
            let currentIdx = -1;
            for (let i = 0; i < ids.length; i++) {
              if (selected.has(ids[i])) currentIdx = i;
            }
            const nextIdx = currentIdx + direction;
            if (nextIdx >= 0 && nextIdx < ids.length) {
              store.selectOne(ids[nextIdx]);
            }
          }
        }
        return;
      }
    }
  };

  onMount(() => document.addEventListener("keydown", handleKeyDown));
  onCleanup(() => document.removeEventListener("keydown", handleKeyDown));

  return (
    <div class="flex flex-col h-full">
      {/* Main area: sidebar + center + detail panel */}
      <div class="flex flex-1 min-h-0">
        <Sidebar />

        <div class="flex flex-col flex-1 min-w-0">
          <TopBar />
          <ContentArea />
        </div>

        <Show when={showDetailPanel()}>
          <DetailPanel />
        </Show>
      </div>

      {/* Status bar: always visible, full width */}
      <StatusBar />

      {/* Settings overlay */}
      <Show when={settingsOpen()}>
        <SettingsPage onClose={() => layout.setCurrentPage("downloads")} />
      </Show>
    </div>
  );
};

export default AppShell;
