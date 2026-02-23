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

  const dl = () => selectedDownload();
  const isActive = () => {
    const d = dl();
    return d != null && (d.status === "downloading" || d.status === "analyzing");
  };

  const percent = () => {
    const d = dl();
    if (!d || !d.total_size || d.total_size === 0) return 0;
    return Math.round((d.downloaded_size / d.total_size) * 100);
  };

  const etaSeconds = () => {
    const d = dl();
    if (!d || !isActive() || d.speed === 0 || !d.total_size) return null;
    return Math.round((d.total_size - d.downloaded_size) / d.speed);
  };

  const progress = () => {
    const d = dl();
    if (!d) return undefined;
    return getProgress(d.id);
  };

  const handleClose = () => {
    clearSelection();
    toggleDetailPanel();
  };

  return (
    <aside class="w-[320px] shrink-0 bg-surface border-l border-border overflow-y-auto">
      <div class="flex flex-col gap-[16px] p-[16px]">
        {/* Header */}
        <div class="flex items-center justify-between">
          <span class="text-caption font-semibold text-muted uppercase tracking-wider">
            Download Details
          </span>
          <button
            class="w-[24px] h-[24px] flex items-center justify-center rounded text-secondary hover:text-primary hover:bg-hover transition-colors cursor-pointer"
            onClick={handleClose}
          >
            <X size={14} />
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
                <p class="text-body font-semibold text-primary break-all leading-snug">
                  {download().filename}
                </p>
                <p class="text-[11px] font-mono text-muted truncate">
                  {download().url}
                </p>
              </div>

              {/* Progress section — only for active/paused/queued */}
              <Show when={download().status !== "completed" && download().status !== "failed"}>
                <div class="flex flex-col gap-[10px] rounded-md bg-inset p-[12px]">
                  {/* Big percent + speed/ETA */}
                  <div class="flex items-end justify-between">
                    <span class="text-[28px] font-bold font-mono text-primary leading-none">
                      {percent()}%
                    </span>
                    <Show when={isActive() && download().speed > 0}>
                      <div class="flex flex-col items-end gap-[2px]">
                        <span class="text-caption font-semibold font-mono text-accent">
                          {formatSpeed(download().speed)}
                        </span>
                        <Show when={etaSeconds() !== null}>
                          <span class="text-[10px] font-mono text-muted">
                            ETA {formatEta(etaSeconds()!)}
                          </span>
                        </Show>
                      </div>
                    </Show>
                  </div>

                  {/* Progress bar */}
                  <div class="h-[6px] rounded-full bg-surface overflow-hidden">
                    <div
                      class="h-full rounded-full bg-accent transition-[width] duration-300"
                      style={{ width: `${percent()}%` }}
                    />
                  </div>

                  {/* Size + connections */}
                  <div class="flex items-center justify-between">
                    <span class="text-[10px] font-mono text-secondary">
                      {formatSize(download().downloaded_size)}
                      {download().total_size != null && ` / ${formatSize(download().total_size!)}`}
                    </span>
                    <span class="text-[10px] font-mono text-muted">
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
                <SpeedSparkline speed={download().speed} />
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
