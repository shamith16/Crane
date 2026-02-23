import { createSignal, Show, type Component } from "solid-js";
import EmptyState from "../content/EmptyState";

const ContentArea: Component = () => {
  // Hardcoded for now — L6 will wire this to real download data
  const [hasDownloads] = createSignal(false);

  return (
    <div class="flex-1 overflow-y-auto min-h-0">
      <Show when={hasDownloads()} fallback={<EmptyState />}>
        {/* L5 will add the download list here */}
        <div />
      </Show>
    </div>
  );
};

export default ContentArea;
