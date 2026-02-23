import { Show, type Component } from "solid-js";
import { useLayout } from "./LayoutContext";
import { useDownloads } from "../../stores/downloads";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import ContentArea from "./ContentArea";
import DetailPanel from "./DetailPanel";
import StatusBar from "./StatusBar";

const AppShell: Component = () => {
  const { detailPanelVisible } = useLayout();
  const { selectedIds } = useDownloads();

  const showDetailPanel = () => detailPanelVisible() && selectedIds().size === 1;

  return (
    <div class="flex flex-col h-full">
      {/* Main area: sidebar + center + detail panel */}
      <div class="flex flex-1 min-h-0">
        <Sidebar />

        {/* Center column: top bar + content */}
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
    </div>
  );
};

export default AppShell;
