import { ErrorBoundary, type Component } from "solid-js";
import { LayoutProvider } from "./components/layout/LayoutContext";
import { DownloadStoreProvider } from "./stores/downloads";
import { SettingsProvider } from "./stores/settings";
import AppShell from "./components/layout/AppShell";
import ErrorFallback from "./components/ErrorFallback";

const App: Component = () => {
  return (
    <DownloadStoreProvider>
      <SettingsProvider>
        <LayoutProvider>
          <ErrorBoundary fallback={(err, reset) => <ErrorFallback error={err} reset={reset} />}>
            <AppShell />
          </ErrorBoundary>
        </LayoutProvider>
      </SettingsProvider>
    </DownloadStoreProvider>
  );
};

export default App;
