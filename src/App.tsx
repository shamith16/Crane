import type { Component } from "solid-js";
import { LayoutProvider } from "./components/layout/LayoutContext";
import { DownloadStoreProvider } from "./stores/downloads";
import { SettingsProvider } from "./stores/settings";
import AppShell from "./components/layout/AppShell";

const App: Component = () => {
  return (
    <DownloadStoreProvider>
      <SettingsProvider>
        <LayoutProvider>
          <AppShell />
        </LayoutProvider>
      </SettingsProvider>
    </DownloadStoreProvider>
  );
};

export default App;
