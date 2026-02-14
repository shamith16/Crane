import { Show, createMemo } from "solid-js";
import type { Download, DownloadProgress } from "../../lib/types";
import { formatSize, formatSpeed, formatEta } from "../../lib/format";
import {
  selectedIds,
  setSelectedIds,
  toggleSelection,
  setSelectedDownloadId,
} from "../../stores/ui";
import {
  pauseDownload,
  resumeDownload,
  retryDownload,
  addDownload,
  openFile,
  openFolder,
} from "../../lib/commands";
import { Pause as PauseIcon, Play, RotateCcw, ExternalLink, FolderOpen, RefreshCw } from "lucide-solid";
import { Tooltip } from "@kobalte/core/tooltip";

// ─── Status styling ─────────────────────────────

function statusColor(status: string): string {
  switch (status) {
    case "downloading":
    case "analyzing":
      return "text-active";
    case "completed":
      return "text-success";
    case "failed":
      return "text-error";
    case "paused":
      return "text-warning";
    case "queued":
    case "pending":
    default:
      return "text-text-secondary";
  }
}

function leftAccentClass(status: string): string {
  switch (status) {
    case "failed":
      return "border-l-2 border-l-error";
    case "paused":
      return "border-l-2 border-l-warning";
    case "downloading":
    case "analyzing":
      return "border-l-2 border-l-active";
    default:
      return "border-l-2 border-l-transparent";
  }
}

// ─── Component ──────────────────────────────────

interface Props {
  download: Download;
  progress: DownloadProgress | undefined;
  onRefresh: () => void;
  /** Ordered list of visible download IDs for shift-click range selection */
  visibleIds: string[];
}

export default function DownloadCard(props: Props) {
  const dl = () => props.download;
  const isSelected = () => selectedIds().has(dl().id);

  const liveProgress = createMemo(() => {
    const p = props.progress;
    if (p) {
      return {
        downloaded: p.downloaded_size,
        total: p.total_size,
        speed: p.speed,
        eta: p.eta_seconds,
      };
    }
    return {
      downloaded: dl().downloaded_size,
      total: dl().total_size,
      speed: dl().speed,
      eta: null as number | null,
    };
  });

  const percentComplete = createMemo(() => {
    const { downloaded, total } = liveProgress();
    if (!total || total === 0) return 0;
    return Math.min(100, (downloaded / total) * 100);
  });

  function handleClick(e: MouseEvent) {
    // If meta/ctrl held, do multi-select toggle only
    if (e.metaKey || e.ctrlKey) {
      toggleSelection(dl().id, e);
      return;
    }

    // Shift+click: range select
    if (e.shiftKey) {
      handleShiftClick(e);
      return;
    }

    // Plain click: select this item and open detail panel
    toggleSelection(dl().id, e);
    setSelectedDownloadId(dl().id);
  }

  function handleShiftClick(e: MouseEvent) {
    const ids = props.visibleIds;
    const current = selectedIds();
    // Find the last selected item's index in visible list
    let lastIdx = -1;
    for (let i = ids.length - 1; i >= 0; i--) {
      if (current.has(ids[i])) {
        lastIdx = i;
        break;
      }
    }
    const clickedIdx = ids.indexOf(dl().id);
    if (lastIdx === -1 || clickedIdx === -1) {
      toggleSelection(dl().id, e);
      return;
    }
    const start = Math.min(lastIdx, clickedIdx);
    const end = Math.max(lastIdx, clickedIdx);
    const rangeIds = ids.slice(start, end + 1);
    // Merge with existing selection
    const next = new Set(current);
    for (const id of rangeIds) next.add(id);
    // Directly set since toggleSelection doesn't handle range
    setSelectedIds(next);
  }

  // ─── Actions ──────────────────────────────────

  async function handlePause(e: MouseEvent) {
    e.stopPropagation();
    try {
      await pauseDownload(dl().id);
      props.onRefresh();
    } catch (err) {
      console.error("Pause failed:", err);
    }
  }

  async function handleResume(e: MouseEvent) {
    e.stopPropagation();
    try {
      await resumeDownload(dl().id);
      props.onRefresh();
    } catch (err) {
      console.error("Resume failed:", err);
    }
  }

  async function handleRetry(e: MouseEvent) {
    e.stopPropagation();
    try {
      await retryDownload(dl().id);
      props.onRefresh();
    } catch (err) {
      console.error("Retry failed:", err);
    }
  }

  async function handleOpenFile(e: MouseEvent) {
    e.stopPropagation();
    try {
      await openFile(dl().id);
    } catch (err) {
      console.error("Open file failed:", err);
    }
  }

  async function handleOpenFolder(e: MouseEvent) {
    e.stopPropagation();
    try {
      await openFolder(dl().id);
    } catch (err) {
      console.error("Open folder failed:", err);
    }
  }

  async function handleRedownload(e: MouseEvent) {
    e.stopPropagation();
    try {
      await addDownload(dl().url);
      props.onRefresh();
    } catch (err) {
      console.error("Redownload failed:", err);
    }
  }

  return (
    <div
      class={`px-4 py-3 cursor-pointer transition-colors group ${leftAccentClass(dl().status)} ${
        isSelected()
          ? "bg-active/10"
          : "hover:bg-surface-hover"
      }`}
      onClick={handleClick}
    >
      <div class="flex items-center justify-between gap-4">
        {/* File info */}
        <div class="flex-1 min-w-0">
          <p class="text-sm text-text-primary truncate">{dl().filename}</p>
          <div class="flex items-center gap-3 mt-1 text-xs tabular-nums">
            <span class={statusColor(dl().status)}>
              {dl().status}
            </span>
            <span class="text-text-muted">
              {formatSize(liveProgress().downloaded)}
              {liveProgress().total ? ` / ${formatSize(liveProgress().total)}` : ""}
            </span>
            <Show when={dl().status === "downloading" || dl().status === "analyzing"}>
              <span class="text-text-secondary">{formatSpeed(liveProgress().speed)}</span>
            </Show>
            <Show when={(dl().status === "downloading" || dl().status === "analyzing") && liveProgress().eta !== null}>
              <span class="text-text-muted">{formatEta(liveProgress().eta)}</span>
            </Show>
            <Show when={dl().source_domain}>
              <span class="text-text-muted truncate max-w-[120px]">{dl().source_domain}</span>
            </Show>
          </div>
        </div>

        {/* Hover actions */}
        <div class="flex gap-1 items-center">
          <Show when={dl().status === "downloading"}>
            <Tooltip openDelay={300}>
              <Tooltip.Trigger
                as="button"
                onClick={handlePause}
                class="p-1.5 rounded-md text-text-secondary hover:text-text-primary hover:bg-surface-hover opacity-0 group-hover:opacity-100 transition-all"
              >
                <PauseIcon size={15} stroke-width={1.75} />
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content class="tooltip-content">
                  Pause
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip>
          </Show>

          <Show when={dl().status === "paused"}>
            <Tooltip openDelay={300}>
              <Tooltip.Trigger
                as="button"
                onClick={handleResume}
                class="p-1.5 rounded-md text-text-secondary hover:text-active hover:bg-active/10 opacity-0 group-hover:opacity-100 transition-all"
              >
                <Play size={15} stroke-width={1.75} />
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content class="tooltip-content">
                  Resume
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip>
          </Show>

          <Show when={dl().status === "failed"}>
            <Tooltip openDelay={300}>
              <Tooltip.Trigger
                as="button"
                onClick={handleRetry}
                class="p-1.5 rounded-md text-error hover:bg-error/10 transition-all"
              >
                <RotateCcw size={15} stroke-width={1.75} />
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content class="tooltip-content">
                  Retry
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip>
          </Show>

          <Show when={dl().status === "completed"}>
            <div class="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <Tooltip openDelay={300}>
                <Tooltip.Trigger
                  as="button"
                  onClick={handleOpenFile}
                  class="p-1.5 rounded-md text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-all"
                >
                  <ExternalLink size={15} stroke-width={1.75} />
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content class="tooltip-content">
                    Open file
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip>
              <Tooltip openDelay={300}>
                <Tooltip.Trigger
                  as="button"
                  onClick={handleOpenFolder}
                  class="p-1.5 rounded-md text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-all"
                >
                  <FolderOpen size={15} stroke-width={1.75} />
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content class="tooltip-content">
                    Open folder
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip>
              <Tooltip openDelay={300}>
                <Tooltip.Trigger
                  as="button"
                  onClick={handleRedownload}
                  class="p-1.5 rounded-md text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-all"
                >
                  <RefreshCw size={15} stroke-width={1.75} />
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content class="tooltip-content">
                    Redownload
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip>
            </div>
          </Show>
        </div>
      </div>

      {/* Progress bar for downloading/paused */}
      <Show when={dl().status === "downloading" || dl().status === "paused" || dl().status === "analyzing"}>
        <div class="mt-2 h-1.5 bg-surface rounded-full overflow-hidden">
          <div
            class={`h-full rounded-full transition-all duration-300 ${
              dl().status === "paused" ? "bg-warning" : "progress-shimmer"
            }`}
            style={{ width: `${percentComplete()}%` }}
          />
        </div>
      </Show>

      {/* Error message for failed */}
      <Show when={dl().status === "failed" && dl().error_message}>
        <p class="mt-1 text-xs text-error truncate">{dl().error_message}</p>
      </Show>
    </div>
  );
}
