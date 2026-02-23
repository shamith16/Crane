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
  if (bytesPerSec < 1024) return `${bytesPerSec} B/s`;
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
  const { selectedIds, selectOne, toggleSelect, rangeSelect } = useDownloads();
  const { setDetailPanelVisible } = useLayout();

  const dl = () => props.download;
  const icon = () => categoryIcons[dl().category] ?? File;
  const isActive = () => dl().status === "downloading" || dl().status === "analyzing";
  const isSelected = () => selectedIds().has(dl().id);

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
    if (!dl().total_size || dl().total_size === 0) return 0;
    return (dl().downloaded_size / dl().total_size!) * 100;
  };

  const sizeLabel = () => {
    if (isActive() || dl().status === "queued" || dl().status === "paused") {
      const downloaded = formatSize(dl().downloaded_size);
      const total = dl().total_size != null ? formatSize(dl().total_size!) : "??";
      return `${downloaded} / ${total}`;
    }
    return dl().total_size != null ? formatSize(dl().total_size!) : formatSize(dl().downloaded_size);
  };

  const etaSeconds = () => {
    if (!isActive() || dl().speed === 0 || !dl().total_size) return null;
    return Math.round((dl().total_size! - dl().downloaded_size) / dl().speed);
  };

  return (
    <div
      class={`flex flex-col gap-[8px] rounded-md bg-surface p-[10px_12px] cursor-pointer transition-colors hover:bg-hover ${
        isSelected() ? "ring-1 ring-accent" : ""
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
              class={`text-body font-medium text-primary truncate ${isOverflowing() ? "animate-marquee !w-max" : ""}`}
            >
              {dl().filename}
            </p>
          </div>

          {/* Meta row */}
          <div class="flex items-center gap-[12px] font-mono">
            <Show when={isActive() && dl().speed > 0}>
              <span class="text-caption font-semibold text-accent">{formatSpeed(dl().speed)}</span>
            </Show>

            <Show when={isActive() && etaSeconds() !== null}>
              <span class="text-caption font-medium text-muted">{formatEta(etaSeconds()!)}</span>
            </Show>

            <Show when={dl().status === "completed"}>
              <span class="text-caption font-semibold text-success">Complete</span>
            </Show>

            <Show when={dl().status === "failed"}>
              <span class="text-caption font-semibold text-error">Failed</span>
            </Show>

            <Show when={dl().status === "queued" || dl().status === "paused"}>
              <span class="text-caption font-medium text-muted">
                {dl().status === "paused" ? "Paused" : "Waiting"}
              </span>
            </Show>

            <span class="text-caption font-medium text-secondary">{sizeLabel()}</span>

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
