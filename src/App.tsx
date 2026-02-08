import { createSignal, onMount } from "solid-js";
import UrlInput from "./components/UrlInput";
import DownloadList from "./components/DownloadList";
import Sidebar from "./components/layout/Sidebar";
import DetailPanel from "./components/layout/DetailPanel";
import CommandPalette from "./components/command-palette/CommandPalette";
import { applyTheme } from "./lib/theme";
import type { Download } from "./lib/types";

export default function App() {
  const [refreshTrigger, setRefreshTrigger] = createSignal(0);
  const [downloads, setDownloads] = createSignal<Download[]>([]);

  onMount(() => {
    applyTheme("dark");
  });

  function handleDownloadAdded() {
    setRefreshTrigger((n) => n + 1);
  }

  return (
    <div class="h-screen bg-bg text-text-primary flex flex-col">
      <UrlInput onDownloadAdded={handleDownloadAdded} />
      <div class="flex flex-1 overflow-hidden">
        <Sidebar downloads={downloads()} />
        <DownloadList
          refreshTrigger={refreshTrigger()}
          onDownloadsLoaded={setDownloads}
        />
        <DetailPanel />
      </div>
      <CommandPalette downloads={downloads()} />
    </div>
  );
}
