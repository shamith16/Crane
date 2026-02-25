import { Show, type Component } from "solid-js";
import { X } from "lucide-solid";
import { useLayout } from "./LayoutContext";
import { useDownloads } from "../../stores/downloads";
import ConnectionSegments from "../detail/ConnectionSegments";
import FileInfoGrid from "../detail/FileInfoGrid";
import DetailActions from "../detail/DetailActions";
import SpeedSparkline from "../detail/SpeedSparkline";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec < 1024) return `${bytesPerSec} B/s`;
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  if (bytesPerSec < 1024 * 1024 * 1024) return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
  return `${(bytesPerSec / (1024 * 1024 * 1024)).toFixed(1)} GB/s`;
}

function formatEta(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

const DetailPanel: Component = () => {
  const { toggleDetailPanel } = useLayout();
  const { selectedDownload, clearSelection, getProgress } = useDownloads();

  // Base download — only changes on selection or status change, NOT on progress ticks
  const dl = () => selectedDownload();
  const isActive = () => {
    const d = dl();
    return d != null && (d.status === "downloading" || d.status === "analyzing");
  };

  // Read progress fields directly from store for fine-grained reactivity
  const progress = () => {
    const d = dl();
    if (!d) return undefined;
    return getProgress(d.id);
  };

  const liveSpeed = () => progress()?.speed ?? dl()?.speed ?? 0;
  const liveDownloaded = () => progress()?.downloaded_size ?? dl()?.downloaded_size ?? 0;
  const liveTotalSize = () => progress()?.total_size ?? dl()?.total_size;

  const percent = () => {
    const total = liveTotalSize();
    if (!total || total === 0) return 0;
    return Math.round((liveDownloaded() / total) * 100);
  };

  const etaSeconds = () => {
    const speed = liveSpeed();
    const total = liveTotalSize();
    if (!isActive() || speed === 0 || !total) return null;
    return Math.round((total - liveDownloaded()) / speed);
  };

  const handleClose = () => {
    clearSelection();
    toggleDetailPanel();
  };

  return (
    <aside class="w-[320px] shrink-0 bg-surface border-l border-divider overflow-y-auto">
      <div class="flex flex-col gap-[16px] py-[20px] px-[16px]">
        {/* Header */}
        <div class="flex items-center justify-between">
          <span class="text-caption font-semibold text-muted uppercase tracking-wider">
            Download Details
          </span>
          <button
            class="w-[24px] h-[24px] flex items-center justify-center rounded text-muted hover:text-primary hover:bg-hover transition-colors cursor-pointer"
            onClick={handleClose}
          >
            <X size={16} />
          </button>
        </div>

        <Show
          when={dl()}
          fallback={
            <p class="text-body-sm text-secondary">Select a download to view details</p>
          }
        >
          {(download) => (
            <>
              {/* File info: name + source */}
              <div class="flex flex-col gap-[4px]">
                <p class="text-heading-sm font-semibold text-primary break-all leading-snug">
                  {download().filename}
                </p>
                <p class="text-caption font-mono text-muted truncate">
                  {download().source_domain ?? download().url}
                </p>
              </div>

              {/* Progress section — only for active/paused/queued */}
              <Show when={download().status !== "completed" && download().status !== "failed"}>
                <div class="flex flex-col gap-[8px] rounded-lg bg-inset p-[16px]">
                  {/* Big percent + speed/ETA */}
                  <div class="flex items-center justify-between">
                    <span class="text-display font-bold font-mono text-accent leading-none">
                      {percent()}%
                    </span>
                    <Show when={isActive() && liveSpeed() > 0}>
                      <div class="flex flex-col items-end gap-[2px]">
                        <span class="text-body-lg font-semibold font-mono text-primary">
                          {formatSpeed(liveSpeed())}
                        </span>
                        <Show when={etaSeconds() !== null}>
                          <span class="text-caption font-mono font-medium text-muted">
                            ETA {formatEta(etaSeconds()!)}
                          </span>
                        </Show>
                      </div>
                    </Show>
                  </div>

                  {/* Progress bar */}
                  <div class="h-[6px] rounded-[3px] bg-surface overflow-hidden">
                    <div
                      class="h-full rounded-[3px] bg-accent transition-[width] duration-300"
                      style={{ width: `${percent()}%` }}
                    />
                  </div>

                  {/* Size + connections */}
                  <div class="flex items-center justify-between">
                    <span class="text-caption font-mono font-medium text-secondary">
                      {formatSize(liveDownloaded())}
                      {liveTotalSize() != null && ` / ${formatSize(liveTotalSize()!)}`}
                    </span>
                    <span class="text-caption font-mono font-medium text-muted">
                      {download().connections} {download().connections === 1 ? "connection" : "connections"}
                    </span>
                  </div>
                </div>
              </Show>

              {/* Segments — only when we have connection progress data */}
              <Show when={progress()?.connections && progress()!.connections.length > 0}>
                <ConnectionSegments connections={progress()!.connections} />
              </Show>

              {/* Speed sparkline — only for active downloads */}
              <Show when={isActive()}>
                <SpeedSparkline speed={liveSpeed()} />
              </Show>

              {/* File info grid */}
              <FileInfoGrid download={download()} />

              {/* Spacer */}
              <div class="flex-1" />

              {/* Action buttons */}
              <DetailActions download={download()} />
            </>
          )}
        </Show>
      </div>
    </aside>
  );
};

export default DetailPanel;
