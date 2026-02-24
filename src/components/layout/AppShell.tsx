import { Show, Switch, Match, type Component } from "solid-js";
import { useLayout } from "./LayoutContext";
import { useDownloads } from "../../stores/downloads";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import ContentArea from "./ContentArea";
import DetailPanel from "./DetailPanel";
import StatusBar from "./StatusBar";
import SettingsPage from "../settings/SettingsPage";

const AppShell: Component = () => {
  const { detailPanelVisible, currentPage } = useLayout();
  const { selectedIds } = useDownloads();

  const showDetailPanel = () => detailPanelVisible() && selectedIds().size === 1 && currentPage() === "downloads";

  return (
    <div class="flex flex-col h-full">
      {/* Main area: sidebar + center + detail panel */}
      <div class="flex flex-1 min-h-0">
        <Show when={currentPage() === "downloads"}>
          <Sidebar />
        </Show>

        <Switch>
          <Match when={currentPage() === "downloads"}>
            <div class="flex flex-col flex-1 min-w-0">
              <TopBar />
              <ContentArea />
            </div>
          </Match>
          <Match when={currentPage() === "settings"}>
            <SettingsPage />
          </Match>
        </Switch>

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
