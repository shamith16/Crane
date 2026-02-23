import type { Component } from "solid-js";
import { LayoutProvider } from "./components/layout/LayoutContext";
import { DownloadStoreProvider } from "./stores/downloads";
import AppShell from "./components/layout/AppShell";

const App: Component = () => {
  return (
    <DownloadStoreProvider>
      <LayoutProvider>
        <AppShell />
      </LayoutProvider>
    </DownloadStoreProvider>
  );
};

export default App;
