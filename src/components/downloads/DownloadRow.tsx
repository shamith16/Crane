import { Show, createMemo } from "solid-js";
import type { Download, DownloadProgress } from "../../lib/types";
import type { FileCategory } from "../../lib/types";
import { formatSize, formatSpeed, formatEta } from "../../lib/format";
import {
  selectedIds,
  setSelectedIds,
  toggleSelection,
  clearSelection,
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
import { Tooltip } from "@kobalte/core/tooltip";
import MaterialIcon from "../shared/MaterialIcon";

// ─── Icon badge config ──────────────────────────

interface BadgeConfig {
  icon: string;
  bg: string;
  text: string;
}

function badgeFor(category: FileCategory): BadgeConfig {
  switch (category) {
    case "documents":
      return { icon: "description", bg: "bg-active/15", text: "text-active" };
    case "video":
      return { icon: "movie", bg: "bg-accent/15", text: "text-accent" };
    case "audio":
      return { icon: "music_note", bg: "bg-pink-500/15", text: "text-pink-500" };
    case "images":
      return { icon: "image", bg: "bg-emerald-500/15", text: "text-emerald-500" };
    case "archives":
      return { icon: "archive", bg: "bg-warning/15", text: "text-warning" };
    case "software":
      return { icon: "widgets", bg: "bg-cyan-500/15", text: "text-cyan-500" };
    default:
      return { icon: "insert_drive_file", bg: "bg-text-muted/10", text: "text-text-muted" };
  }
}

function formatTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

// ─── Component ──────────────────────────────────

interface Props {
  download: Download;
  progress: DownloadProgress | undefined;
  onRefresh: () => void;
  visibleIds: string[];
}

export default function DownloadRow(props: Props) {
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

  const badge = createMemo(() => badgeFor(dl().category));

  // ─── Click handling ───────────────────────────

  function handleClick(e: MouseEvent) {
    if (e.metaKey || e.ctrlKey) {
      toggleSelection(dl().id, e);
      return;
    }
    if (e.shiftKey) {
      handleShiftClick(e);
      return;
    }
    clearSelection();
    setSelectedDownloadId(dl().id);
  }

  function handleShiftClick(e: MouseEvent) {
    const ids = props.visibleIds;
    const current = selectedIds();
    let lastIdx = -1;
    for (let i = ids.length - 1; i >= 0; i--) {
      if (current.has(ids[i])) { lastIdx = i; break; }
    }
    const clickedIdx = ids.indexOf(dl().id);
    if (lastIdx === -1 || clickedIdx === -1) {
      toggleSelection(dl().id, e);
      return;
    }
    const start = Math.min(lastIdx, clickedIdx);
    const end = Math.max(lastIdx, clickedIdx);
    const rangeIds = ids.slice(start, end + 1);
    const next = new Set(current);
    for (const id of rangeIds) next.add(id);
    setSelectedIds(next);
  }

  // ─── Actions ──────────────────────────────────

  async function handlePause(e: MouseEvent) {
    e.stopPropagation();
    try { await pauseDownload(dl().id); props.onRefresh(); }
    catch (err) { console.error("Pause failed:", err); }
  }

  async function handleResume(e: MouseEvent) {
    e.stopPropagation();
    try { await resumeDownload(dl().id); props.onRefresh(); }
    catch (err) { console.error("Resume failed:", err); }
  }

  async function handleRetry(e: MouseEvent) {
    e.stopPropagation();
    try { await retryDownload(dl().id); props.onRefresh(); }
    catch (err) { console.error("Retry failed:", err); }
  }

  async function handleOpenFile(e: MouseEvent) {
    e.stopPropagation();
    try { await openFile(dl().id); }
    catch (err) { console.error("Open file failed:", err); }
  }

  async function handleOpenFolder(e: MouseEvent) {
    e.stopPropagation();
    try { await openFolder(dl().id); }
    catch (err) { console.error("Open folder failed:", err); }
  }

  async function handleRedownload(e: MouseEvent) {
    e.stopPropagation();
    try { await addDownload(dl().url); props.onRefresh(); }
    catch (err) { console.error("Redownload failed:", err); }
  }

  // ─── Status helpers ───────────────────────────

  const isActive = () => dl().status === "downloading" || dl().status === "analyzing";
  const isPaused = () => dl().status === "paused";
  const isCompleted = () => dl().status === "completed";
  const isFailed = () => dl().status === "failed";
  const isQueued = () => dl().status === "queued" || dl().status === "pending";

  // ─── Render ───────────────────────────────────

  return (
    <div
      class={`download-card flex gap-4 p-4 rounded-lg cursor-pointer transition-all group animate-fade-in ${
        isSelected()
          ? "bg-surface-hover border border-active/30"
          : "bg-surface-hover border border-border hover:border-text-muted/20"
      }`}
      onClick={handleClick}
    >
      {/* Category icon */}
      <div
        class={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${badge().bg}`}
      >
        <MaterialIcon name={badge().icon} size={20} class={badge().text} />
      </div>

      {/* Content */}
      <div class="min-w-0 flex-1">
        {/* Top line: filename + stats */}
        <div class="flex items-center gap-3">
          <p class="text-sm text-text-primary font-semibold truncate flex-1">{dl().filename}</p>

          {/* Speed */}
          <Show when={isActive()}>
            <span class="text-xs text-active tabular-nums shrink-0">{formatSpeed(liveProgress().speed)}</span>
          </Show>
          <Show when={isPaused()}>
            <span class="text-xs text-warning shrink-0">Paused</span>
          </Show>

          {/* ETA */}
          <Show when={isActive() && liveProgress().eta !== null}>
            <span class="text-xs text-text-muted tabular-nums shrink-0">~{formatEta(liveProgress().eta)}</span>
          </Show>

          {/* Size */}
          <span class="text-xs text-text-secondary tabular-nums shrink-0">
            <Show when={isActive() || isPaused()}>
              {formatSize(liveProgress().downloaded)} / {formatSize(liveProgress().total)}
            </Show>
            <Show when={isCompleted()}>
              {formatSize(dl().total_size)}
            </Show>
            <Show when={isFailed()}>
              {formatSize(dl().downloaded_size)}{dl().total_size ? ` / ${formatSize(dl().total_size)}` : ""}
            </Show>
            <Show when={isQueued() && dl().total_size}>
              {formatSize(dl().total_size)}
            </Show>
          </span>
        </div>

        {/* Second line: domain + status badges */}
        <div class="flex items-center gap-2 mt-0.5">
          <Show when={dl().source_domain}>
            <span class="text-xs text-text-muted truncate">{dl().source_domain}</span>
          </Show>
          <Show when={isCompleted()}>
            <span class="text-xs text-success flex items-center gap-1">
              <MaterialIcon name="check_circle" size={14} class="text-success" filled />
              Done
            </span>
            <Show when={dl().completed_at}>
              <span class="text-xs text-text-muted">Today at {formatTime(dl().completed_at)}</span>
            </Show>
          </Show>
          <Show when={isFailed()}>
            <span class="text-xs text-error flex items-center gap-1 truncate">
              <MaterialIcon name="error" size={14} class="text-error" filled />
              {dl().error_message || "Failed"}
            </span>
          </Show>
          <Show when={isQueued()}>
            <span class="text-xs text-text-muted flex items-center gap-1">
              <MaterialIcon name="hourglass_empty" size={14} />
              {dl().status === "queued" ? "Queued" : "Pending"}
            </span>
          </Show>
        </div>

        {/* Progress bar (for active/paused) */}
        <Show when={isActive() || isPaused()}>
          <div class="mt-2">
            <div class="h-1 bg-border rounded-sm overflow-hidden">
              <div
                class={`h-full rounded-sm transition-all duration-300 ${
                  isPaused() ? "bg-warning" : "progress-shimmer"
                }`}
                style={{ width: `${percentComplete()}%` }}
              />
            </div>
          </div>
        </Show>
      </div>

      {/* Hover actions */}
      <div class="flex gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity self-center">
        <Show when={dl().status === "downloading"}>
          <Tooltip openDelay={300}>
            <Tooltip.Trigger
              as="button"
              onClick={handlePause}
              class="p-1.5 rounded-md text-text-secondary hover:text-text-primary hover:bg-border transition-all"
            >
              <MaterialIcon name="pause" size={16} />
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content class="tooltip-content">Pause</Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip>
        </Show>

        <Show when={isPaused()}>
          <Tooltip openDelay={300}>
            <Tooltip.Trigger
              as="button"
              onClick={handleResume}
              class="p-1.5 rounded-md text-text-secondary hover:text-active hover:bg-active/10 transition-all"
            >
              <MaterialIcon name="play_arrow" size={16} />
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content class="tooltip-content">Resume</Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip>
        </Show>

        <Show when={isFailed()}>
          <Tooltip openDelay={300}>
            <Tooltip.Trigger
              as="button"
              onClick={handleRetry}
              class="p-1.5 rounded-md text-error hover:bg-error/10 transition-all"
            >
              <MaterialIcon name="refresh" size={16} />
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content class="tooltip-content">Retry</Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip>
        </Show>

        <Show when={isCompleted()}>
          <Tooltip openDelay={300}>
            <Tooltip.Trigger
              as="button"
              onClick={handleOpenFile}
              class="p-1.5 rounded-md text-text-secondary hover:text-text-primary hover:bg-border transition-all"
            >
              <MaterialIcon name="open_in_new" size={16} />
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content class="tooltip-content">Open file</Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip>
          <Tooltip openDelay={300}>
            <Tooltip.Trigger
              as="button"
              onClick={handleOpenFolder}
              class="p-1.5 rounded-md text-text-secondary hover:text-text-primary hover:bg-border transition-all"
            >
              <MaterialIcon name="folder_open" size={16} />
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content class="tooltip-content">Open folder</Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip>
          <Tooltip openDelay={300}>
            <Tooltip.Trigger
              as="button"
              onClick={handleRedownload}
              class="p-1.5 rounded-md text-text-secondary hover:text-text-primary hover:bg-border transition-all"
            >
              <MaterialIcon name="refresh" size={16} />
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content class="tooltip-content">Redownload</Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip>
        </Show>
      </div>
    </div>
  );
}
