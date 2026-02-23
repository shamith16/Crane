import { Show, type Component } from "solid-js";
import { useDownloads } from "../../stores/downloads";
import EmptyState from "../content/EmptyState";
import DownloadList from "../content/DownloadList";

const ContentArea: Component = () => {
  const { hasDownloads } = useDownloads();

  return (
    <div class="flex-1 overflow-y-auto min-h-0">
      <Show when={hasDownloads()} fallback={<EmptyState />}>
        <DownloadList />
      </Show>
    </div>
  );
};

export default ContentArea;
