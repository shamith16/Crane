import { createSignal, onMount } from "solid-js";
import UrlInput from "./components/UrlInput";
import DownloadList from "./components/DownloadList";
import { applyTheme } from "./lib/theme";

export default function App() {
  const [refreshTrigger, setRefreshTrigger] = createSignal(0);

  onMount(() => {
    applyTheme("dark");
  });

  function handleDownloadAdded() {
    setRefreshTrigger((n) => n + 1);
  }

  return (
    <div class="h-screen bg-bg text-text-primary flex flex-col">
      <UrlInput onDownloadAdded={handleDownloadAdded} />
      <DownloadList refreshTrigger={refreshTrigger()} />
    </div>
  );
}
