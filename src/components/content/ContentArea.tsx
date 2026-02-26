import { Show, For, type Component } from "solid-js";
import { useDownloads } from "../../stores/downloads";
import EmptyState from "../content/EmptyState";
import DownloadList from "../content/DownloadList";
import FloatingActionBar from "../content/FloatingActionBar";
import ShimmerBar from "../dialog/ShimmerBar";

const SkeletonRow: Component = () => (
  <div class="flex items-center gap-[12px] rounded-xl bg-surface p-[12px_16px]">
    {/* Icon placeholder */}
    <div class="w-[36px] h-[36px] rounded-lg overflow-hidden bg-surface shrink-0">
      <div class="h-full w-full animate-shimmer bg-gradient-to-r from-surface via-hover to-surface" />
    </div>
    {/* Text lines */}
    <div class="flex-1 flex flex-col gap-[8px]">
      <ShimmerBar width="60%" />
      <ShimmerBar width="35%" />
    </div>
    {/* Right side placeholder */}
    <div class="shrink-0">
      <ShimmerBar width="64px" />
    </div>
  </div>
);

const ContentArea: Component = () => {
  const { state, hasDownloads, clearSelection } = useDownloads();

  return (
    <div
      class="relative flex-1 overflow-y-auto min-h-0"
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (!target.closest("[data-download-row]")) clearSelection();
      }}
    >
      <Show when={!state.loading} fallback={
        <div class="flex flex-col gap-[8px] p-[16px_20px]">
          <For each={[0, 1, 2, 3]}>
            {() => <SkeletonRow />}
          </For>
        </div>
      }>
        <Show when={hasDownloads()} fallback={<EmptyState />}>
          <DownloadList />
        </Show>
      </Show>
      <FloatingActionBar />
    </div>
  );
};

export default ContentArea;
