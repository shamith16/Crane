import { createSignal, Show, type Component } from "solid-js";
import {
  FileText,
  Video,
  Music,
  Image,
  Archive,
  Package,
  File,
} from "lucide-solid";
import type { Download, FileCategory } from "../../types/download";
import { useDownloads } from "../../stores/downloads";
import { useLayout } from "../layout/LayoutContext";
import ProgressBar from "./ProgressBar";

interface DownloadRowProps {
  download: Download;
}

const categoryIcons: Record<FileCategory, typeof FileText> = {
  documents: FileText,
  video: Video,
  audio: Music,
  images: Image,
  archives: Archive,
  software: Package,
  other: File,
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec < 1024) return `${Math.round(bytesPerSec)} B/s`;
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  if (bytesPerSec < 1024 * 1024 * 1024) return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
  return `${(bytesPerSec / (1024 * 1024 * 1024)).toFixed(1)} GB/s`;
}

function formatEta(seconds: number): string {
  if (seconds < 60) return `ETA ${seconds}s`;
  if (seconds < 3600) return `ETA ${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `ETA ${h}h ${String(m).padStart(2, "0")}m`;
}

function iconColor(status: Download["status"]): string {
  switch (status) {
    case "downloading":
    case "analyzing":
      return "text-accent";
    case "completed":
      return "text-success";
    case "failed":
      return "text-error";
    default:
      return "text-tertiary";
  }
}

const DownloadRow: Component<DownloadRowProps> = (props) => {
  const { selectedIds, selectOne, toggleSelect, rangeSelect, getProgress } = useDownloads();
  const { setDetailPanelVisible } = useLayout();

  const dl = () => props.download;
  const icon = () => categoryIcons[dl().category] ?? File;
  const isActive = () => dl().status === "downloading" || dl().status === "analyzing";
  const isSelected = () => selectedIds().has(dl().id);

  // Read progress directly from store for fine-grained reactivity
  const liveSpeed = () => getProgress(dl().id)?.speed ?? dl().speed;
  const liveDownloaded = () => getProgress(dl().id)?.downloaded_size ?? dl().downloaded_size;
  const liveTotalSize = () => getProgress(dl().id)?.total_size ?? dl().total_size;

  const handleClick = (e: MouseEvent) => {
    if (e.shiftKey) {
      rangeSelect(dl().id);
    } else if (e.metaKey || e.ctrlKey) {
      toggleSelect(dl().id);
    } else {
      selectOne(dl().id);
      setDetailPanelVisible(true);
    }
  };

  let nameRef!: HTMLParagraphElement;
  const [isOverflowing, setIsOverflowing] = createSignal(false);

  const checkOverflow = () => {
    if (nameRef) {
      setIsOverflowing(nameRef.scrollWidth > nameRef.clientWidth);
    }
  };

  const percent = () => {
    const total = liveTotalSize();
    if (!total || total === 0) return 0;
    return (liveDownloaded() / total) * 100;
  };

  const sizeLabel = () => {
    if (isActive() || dl().status === "queued" || dl().status === "paused") {
      const downloaded = formatSize(liveDownloaded());
      const total = liveTotalSize() != null ? formatSize(liveTotalSize()!) : "??";
      return `${downloaded} / ${total}`;
    }
    return liveTotalSize() != null ? formatSize(liveTotalSize()!) : formatSize(liveDownloaded());
  };

  const etaSeconds = () => {
    const speed = liveSpeed();
    const total = liveTotalSize();
    if (!isActive() || speed === 0 || !total) return null;
    return Math.round((total - liveDownloaded()) / speed);
  };

  const isCompleted = () => dl().status === "completed";
  const filenameColor = () => isCompleted() ? "text-secondary" : "text-primary";

  return (
    <div
      class={`flex flex-col gap-[8px] rounded-md bg-surface p-[10px_12px] cursor-pointer transition-colors hover:bg-hover ${
        isSelected() ? "border border-accent" : "border border-transparent"
      }`}
      onClick={handleClick}
    >
      {/* Top row: icon + info */}
      <div class="flex items-center gap-[10px]">
        <span class={`shrink-0 ${iconColor(dl().status)}`}>
          {icon()({ size: 16 })}
        </span>

        <div class="flex flex-col gap-[2px] min-w-0 flex-1">
          {/* Filename — marquee only when text is actually truncated */}
          <div class="overflow-hidden" onMouseEnter={checkOverflow} onMouseLeave={() => setIsOverflowing(false)}>
            <p
              ref={nameRef}
              class={`text-body font-medium ${filenameColor()} truncate ${isOverflowing() ? "animate-marquee !w-max" : ""}`}
            >
              {dl().filename}
            </p>
          </div>

          {/* Meta row — order matches Pencil per status */}
          <div class="flex items-center gap-[12px] font-mono">
            {/* Active: speed, ETA, size, source */}
            <Show when={isActive() && liveSpeed() > 0}>
              <span class="text-caption font-semibold text-accent">{formatSpeed(liveSpeed())}</span>
            </Show>

            <Show when={isActive() && etaSeconds() !== null}>
              <span class="text-caption font-medium text-muted">{formatEta(etaSeconds()!)}</span>
            </Show>

            {/* Queued/Paused: size first, then status */}
            <Show when={dl().status === "queued" || dl().status === "paused"}>
              <span class="text-caption font-medium text-secondary">{sizeLabel()}</span>
              <span class="text-caption font-medium text-muted">
                {dl().status === "paused" ? "⏸ Paused" : "○ Waiting"}
              </span>
            </Show>

            {/* Completed: status first, then size */}
            <Show when={isCompleted()}>
              <span class="text-caption font-semibold text-success">✓ Complete</span>
              <span class="text-caption font-medium text-secondary">{sizeLabel()}</span>
            </Show>

            {/* Failed: status first, then size */}
            <Show when={dl().status === "failed"}>
              <span class="text-caption font-semibold text-error">✗ Failed</span>
              <span class="text-caption font-medium text-secondary">{sizeLabel()}</span>
            </Show>

            {/* Active: size after speed/ETA */}
            <Show when={isActive()}>
              <span class="text-caption font-medium text-secondary">{sizeLabel()}</span>
            </Show>

            <Show when={dl().source_domain}>
              <span class="text-caption text-muted">{dl().source_domain}</span>
            </Show>
          </div>
        </div>
      </div>

      {/* Progress bar — only for active downloads */}
      <Show when={isActive()}>
        <ProgressBar percent={percent()} />
      </Show>
    </div>
  );
};

export default DownloadRow;
