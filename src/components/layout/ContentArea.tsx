import { createSignal, Show, type Component } from "solid-js";
import EmptyState from "../content/EmptyState";
import DownloadList from "../content/DownloadList";

const ContentArea: Component = () => {
  // Hardcoded for now — L6 will wire this to real download data
  const [hasDownloads] = createSignal(true);

  return (
    <div class="flex-1 overflow-y-auto min-h-0">
      <Show when={hasDownloads()} fallback={<EmptyState />}>
        <DownloadList />
      </Show>
    </div>
  );
};

export default ContentArea;
