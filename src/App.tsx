import { createSignal, onMount, Show } from "solid-js";
import UrlInput from "./components/UrlInput";
import DownloadList from "./components/DownloadList";
import Sidebar from "./components/layout/Sidebar";
import DetailPanel from "./components/layout/DetailPanel";
import CommandPalette from "./components/command-palette/CommandPalette";
import SettingsPanel from "./components/settings/SettingsPanel";
import DropZone from "./components/shared/DropZone";
import { useKeyboard } from "./hooks/useKeyboard";
import { settingsOpen } from "./stores/ui";
import { applyTheme } from "./lib/theme";
import { addDownload, getSettings } from "./lib/commands";
import StatsHeader from "./components/downloads/StatsHeader";
import type { Download, DownloadProgress } from "./lib/types";

export default function App() {
  useKeyboard();

  const [refreshTrigger, setRefreshTrigger] = createSignal(0);
  const [downloads, setDownloads] = createSignal<Download[]>([]);
  const [progressMap, setProgressMap] = createSignal<Record<string, DownloadProgress>>({});

  onMount(() => {
    // Load theme from saved settings, falling back to dark
    getSettings()
      .then((cfg) => applyTheme(cfg.appearance.theme))
      .catch(() => applyTheme("dark"));
  });

  function handleDownloadAdded() {
    setRefreshTrigger((n) => n + 1);
  }

  function handleUrlDrop(url: string) {
    addDownload(url).then(() => handleDownloadAdded()).catch((err) => {
      console.error("Drop download failed:", err);
    });
  }

  function handleFileDrop(urls: string[]) {
    Promise.allSettled(urls.map((u) => addDownload(u))).then((results) => {
      const failures = results.filter((r) => r.status === "rejected");
      if (failures.length > 0) {
        console.error(`${failures.length} drop download(s) failed:`, failures);
      }
      handleDownloadAdded();
    });
  }

  return (
    <DropZone onUrlDrop={handleUrlDrop} onFileDrop={handleFileDrop}>
      <div class="h-screen bg-bg text-text-primary flex flex-col">
        <UrlInput onDownloadAdded={handleDownloadAdded} />
        <StatsHeader downloads={downloads()} progressMap={progressMap()} />
        <div class="flex flex-1 overflow-hidden">
          <Sidebar downloads={downloads()} />
          <DownloadList
            refreshTrigger={refreshTrigger()}
            onDownloadsLoaded={setDownloads}
            onProgressUpdate={setProgressMap}
          />
          <DetailPanel />
        </div>
        <CommandPalette downloads={downloads()} />
        <Show when={settingsOpen()}>
          <SettingsPanel />
        </Show>
      </div>
    </DropZone>
  );
}
