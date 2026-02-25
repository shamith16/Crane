import { Show, createSignal, onCleanup, type Component } from "solid-js";
import { useDownloads } from "../../stores/downloads";

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec < 1024) return `${Math.round(bytesPerSec)} B/s`;
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  if (bytesPerSec < 1024 * 1024 * 1024) return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
  return `${(bytesPerSec / (1024 * 1024 * 1024)).toFixed(1)} GB/s`;
}

const StatusBar: Component = () => {
  const { state, totalSpeed, activeCount } = useDownloads();
  const [online, setOnline] = createSignal(navigator.onLine);

  const handleOnline = () => setOnline(true);
  const handleOffline = () => setOnline(false);
  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);
  onCleanup(() => {
    window.removeEventListener("online", handleOnline);
    window.removeEventListener("offline", handleOffline);
  });

  const downloadCount = () => state.downloads.length;

  return (
    <div class="flex items-center justify-between h-[36px] shrink-0 px-lg bg-inset">
      {/* Left: connection status + download count */}
      <div class="flex items-center gap-sm">
        <div class={`w-[6px] h-[6px] rounded-full ${online() ? "bg-success" : "bg-error"}`} />
        <span class="text-caption text-secondary">
          {online() ? "Connected" : "Offline"}
        </span>
        <span class="text-caption text-muted">·</span>
        <span class="text-caption text-secondary">
          {downloadCount()} {downloadCount() === 1 ? "Download" : "Downloads"}
        </span>
      </div>

      {/* Right: speed */}
      <Show when={activeCount() > 0}>
        <div class="flex items-center gap-sm">
          <span class="text-caption text-secondary font-mono">
            ↓ {formatSpeed(totalSpeed())}
          </span>
        </div>
      </Show>
    </div>
  );
};

export default StatusBar;
