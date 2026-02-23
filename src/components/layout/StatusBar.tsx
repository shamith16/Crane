import { Show, type Component } from "solid-js";
import { useDownloads } from "../../stores/downloads";
import { isTauri } from "../../lib/tauri";

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec < 1024) return `${bytesPerSec} B/s`;
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  if (bytesPerSec < 1024 * 1024 * 1024) return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
  return `${(bytesPerSec / (1024 * 1024 * 1024)).toFixed(1)} GB/s`;
}

const StatusBar: Component = () => {
  const { state, totalSpeed, activeCount } = useDownloads();
  const connected = () => isTauri();
  const downloadCount = () => state.downloads.length;

  return (
    <div class="flex items-center justify-between h-[36px] shrink-0 px-lg bg-inset border-t border-border">
      {/* Left: connection status + download count */}
      <div class="flex items-center gap-sm">
        <div class={`w-[6px] h-[6px] rounded-full ${connected() ? "bg-success" : "bg-warning"}`} />
        <span class="text-caption text-secondary">
          {connected() ? "Connected" : "Browser Mode"}
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
