import { Show, onMount, onCleanup, type Component } from "solid-js";
import { useLayout } from "./LayoutContext";
import { useDownloads } from "../../stores/downloads";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import ContentArea from "./ContentArea";
import DetailPanel from "./DetailPanel";
import StatusBar from "./StatusBar";
import SettingsPage from "../settings/SettingsPage";

const AppShell: Component = () => {
  const { detailPanelVisible, currentPage, setCurrentPage } = useLayout();
  const { selectedIds } = useDownloads();

  const showDetailPanel = () => detailPanelVisible() && selectedIds().size === 1 && currentPage() === "downloads";
  const settingsOpen = () => currentPage() === "settings";

  const handleKeyDown = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === ",") {
      e.preventDefault();
      setCurrentPage(settingsOpen() ? "downloads" : "settings");
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
        <SettingsPage onClose={() => setCurrentPage("downloads")} />
      </Show>
    </div>
  );
};

export default AppShell;
