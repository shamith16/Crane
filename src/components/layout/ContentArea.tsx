import { Show, onMount, onCleanup, type Component } from "solid-js";
import { useDownloads } from "../../stores/downloads";
import EmptyState from "../content/EmptyState";
import DownloadList from "../content/DownloadList";
import FloatingActionBar from "../content/FloatingActionBar";

const ContentArea: Component = () => {
  const { hasDownloads, clearSelection } = useDownloads();

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") clearSelection();
  };

  onMount(() => document.addEventListener("keydown", handleKeyDown));
  onCleanup(() => document.removeEventListener("keydown", handleKeyDown));

  return (
    <div class="relative flex-1 overflow-y-auto min-h-0">
      <Show when={hasDownloads()} fallback={<EmptyState />}>
        <DownloadList />
      </Show>
      <FloatingActionBar />
    </div>
  );
};

export default ContentArea;
