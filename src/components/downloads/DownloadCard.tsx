import { Show, createMemo } from "solid-js";
import type { Download, DownloadProgress } from "../../lib/types";
import type { FileCategory } from "../../lib/types";
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
import {
  Pause as PauseIcon,
  Play,
  RotateCcw,
  ExternalLink,
  FolderOpen,
  RefreshCw,
  FileText,
  Film,
  Music,
  Image,
  Archive,
  Package,
  File,
  Check,
  AlertCircle,
  Clock,
} from "lucide-solid";
import { Tooltip } from "@kobalte/core/tooltip";

// ─── Icon badge config ──────────────────────────

interface BadgeConfig {
  icon: typeof FileText;
  bg: string;
  text: string;
}

function badgeFor(category: FileCategory): BadgeConfig {
  switch (category) {
    case "documents":
      return { icon: FileText, bg: "bg-active/15", text: "text-active" };
    case "video":
      return { icon: Film, bg: "bg-accent/15", text: "text-accent" };
    case "audio":
      return { icon: Music, bg: "bg-pink-500/15", text: "text-pink-500" };
    case "images":
      return { icon: Image, bg: "bg-emerald-500/15", text: "text-emerald-500" };
    case "archives":
      return { icon: Archive, bg: "bg-warning/15", text: "text-warning" };
    case "software":
      return { icon: Package, bg: "bg-cyan-500/15", text: "text-cyan-500" };
    default:
      return { icon: File, bg: "bg-text-muted/10", text: "text-text-muted" };
  }
}

// ─── Component ──────────────────────────────────

interface Props {
  download: Download;
  progress: DownloadProgress | undefined;
  onRefresh: () => void;
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
    toggleSelection(dl().id, e);
    setSelectedDownloadId(dl().id);
  }

  function handleShiftClick(e: MouseEvent) {
    const ids = props.visibleIds;
    const current = selectedIds();
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

  // ─── Render ───────────────────────────────────

  const isActive = () =>
    dl().status === "downloading" || dl().status === "analyzing";

  return (
    <div
      class={`p-5 rounded-2xl border cursor-pointer transition-all group animate-slide-in flex flex-col gap-3 ${
        isSelected()
          ? "bg-active/10 border-active/30"
          : "bg-surface border-border hover:bg-surface-hover hover:border-border"
      }`}
      onClick={handleClick}
    >
      {/* Icon badge */}
      <div
        class={`w-10 h-10 rounded-xl flex items-center justify-center ${badge().bg} ${
          isActive() ? "ring-1 ring-active/30" : ""
        }`}
      >
        {(() => {
          const Icon = badge().icon;
          return <Icon size={20} class={badge().text} stroke-width={1.75} />;
        })()}
      </div>

      {/* File info */}
      <div class="min-w-0 flex-1">
        <p class="text-sm text-text-primary font-medium truncate">{dl().filename}</p>
        <Show when={dl().source_domain}>
          <p class="text-xs text-text-muted truncate mt-0.5">{dl().source_domain}</p>
        </Show>
      </div>

      {/* Status-specific content */}
      <div class="mt-auto">
        {/* Downloading / Analyzing */}
        <Show when={isActive()}>
          <div class="flex items-center justify-between text-xs tabular-nums mb-1.5">
            <span class="text-text-secondary">
              {formatSize(liveProgress().downloaded)}
              {liveProgress().total ? ` / ${formatSize(liveProgress().total)}` : ""}
            </span>
            <span class="text-text-secondary">{Math.round(percentComplete())}%</span>
          </div>
          <div class="h-1.5 bg-bg rounded-full overflow-hidden">
            <div
              class="h-full rounded-full transition-all duration-300 progress-shimmer"
              style={{ width: `${percentComplete()}%` }}
            />
          </div>
          <div class="flex items-center justify-between mt-1.5 text-xs tabular-nums">
            <span class="text-text-muted">{formatSpeed(liveProgress().speed)}</span>
            <Show when={liveProgress().eta !== null}>
              <span class="text-text-muted">{formatEta(liveProgress().eta)}</span>
            </Show>
          </div>
        </Show>

        {/* Paused */}
        <Show when={dl().status === "paused"}>
          <div class="flex items-center justify-between text-xs tabular-nums mb-1.5">
            <span class="text-text-secondary">
              {formatSize(liveProgress().downloaded)}
              {liveProgress().total ? ` / ${formatSize(liveProgress().total)}` : ""}
            </span>
            <span class="text-text-secondary">{Math.round(percentComplete())}%</span>
          </div>
          <div class="h-1.5 bg-bg rounded-full overflow-hidden">
            <div
              class="h-full rounded-full bg-warning"
              style={{ width: `${percentComplete()}%` }}
            />
          </div>
          <div class="flex items-center mt-1.5">
            <span class="text-xs text-warning flex items-center gap-1">
              <PauseIcon size={12} stroke-width={2} />
              Paused
            </span>
          </div>
        </Show>

        {/* Completed */}
        <Show when={dl().status === "completed"}>
          <div class="flex items-center justify-between">
            <span class="text-xs text-success flex items-center gap-1">
              <Check size={13} stroke-width={2.5} />
              Completed
            </span>
            <span class="text-xs text-text-muted tabular-nums">
              {formatSize(dl().total_size)}
            </span>
          </div>
        </Show>

        {/* Failed */}
        <Show when={dl().status === "failed"}>
          <div class="flex items-center gap-1 text-xs text-error">
            <AlertCircle size={13} stroke-width={2} class="shrink-0" />
            <span class="truncate">{dl().error_message || "Download failed"}</span>
          </div>
        </Show>

        {/* Queued / Pending */}
        <Show when={dl().status === "queued" || dl().status === "pending"}>
          <div class="flex items-center justify-between">
            <span class="text-xs text-text-muted flex items-center gap-1">
              <Clock size={13} stroke-width={1.75} />
              {dl().status === "queued" ? "Queued" : "Pending"}
            </span>
            <Show when={dl().total_size}>
              <span class="text-xs text-text-muted tabular-nums">
                {formatSize(dl().total_size)}
              </span>
            </Show>
          </div>
        </Show>
      </div>

      {/* Hover actions */}
      <div class="flex gap-1 items-center min-h-[28px]">
        <Show when={dl().status === "downloading"}>
          <div class="opacity-0 group-hover:opacity-100 transition-opacity">
            <Tooltip openDelay={300}>
              <Tooltip.Trigger
                as="button"
                onClick={handlePause}
                class="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-all"
              >
                <PauseIcon size={15} stroke-width={1.75} />
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content class="tooltip-content">Pause</Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip>
          </div>
        </Show>

        <Show when={dl().status === "paused"}>
          <div class="opacity-0 group-hover:opacity-100 transition-opacity">
            <Tooltip openDelay={300}>
              <Tooltip.Trigger
                as="button"
                onClick={handleResume}
                class="p-1.5 rounded-lg text-text-secondary hover:text-active hover:bg-active/10 transition-all"
              >
                <Play size={15} stroke-width={1.75} />
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content class="tooltip-content">Resume</Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip>
          </div>
        </Show>

        <Show when={dl().status === "failed"}>
          <Tooltip openDelay={300}>
            <Tooltip.Trigger
              as="button"
              onClick={handleRetry}
              class="p-1.5 rounded-lg text-error hover:bg-error/10 transition-all"
            >
              <RotateCcw size={15} stroke-width={1.75} />
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content class="tooltip-content">Retry</Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip>
        </Show>

        <Show when={dl().status === "completed"}>
          <div class="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <Tooltip openDelay={300}>
              <Tooltip.Trigger
                as="button"
                onClick={handleOpenFile}
                class="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-all"
              >
                <ExternalLink size={15} stroke-width={1.75} />
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content class="tooltip-content">Open file</Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip>
            <Tooltip openDelay={300}>
              <Tooltip.Trigger
                as="button"
                onClick={handleOpenFolder}
                class="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-all"
              >
                <FolderOpen size={15} stroke-width={1.75} />
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content class="tooltip-content">Open folder</Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip>
            <Tooltip openDelay={300}>
              <Tooltip.Trigger
                as="button"
                onClick={handleRedownload}
                class="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-all"
              >
                <RefreshCw size={15} stroke-width={1.75} />
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content class="tooltip-content">Redownload</Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip>
          </div>
        </Show>
      </div>
    </div>
  );
}
