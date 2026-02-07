import { createSignal } from "solid-js";
import UrlInput from "./components/UrlInput";
import DownloadList from "./components/DownloadList";

export default function App() {
  const [refreshTrigger, setRefreshTrigger] = createSignal(0);

  function handleDownloadAdded() {
    setRefreshTrigger((n) => n + 1);
  }

  return (
    <div class="h-screen bg-[#0D0D0D] text-[#E8E8E8] flex flex-col">
      <UrlInput onDownloadAdded={handleDownloadAdded} />
      <DownloadList refreshTrigger={refreshTrigger()} />
    </div>
  );
}
