import { createSignal, Show, type Component } from "solid-js";
import {
  FileText, Video, Music, Image, Archive, Package, File,
  CircleCheck, CircleX, Server, Pencil, FolderOpen, Minus, Plus, Download,
} from "lucide-solid";
import type { UrlAnalysis, FileCategory } from "../../types/download";

interface ConfirmStateProps {
  analysis: UrlAnalysis;
  defaultSavePath: string;
  defaultConnections: number;
  onConfirm: (opts: { filename: string; savePath: string; connections: number }) => void;
  onCancel: () => void;
  submitting?: boolean;
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

function fileExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot > 0 ? filename.slice(dot + 1).toUpperCase() : "";
}

const ConfirmState: Component<ConfirmStateProps> = (props) => {
  const [filename, setFilename] = createSignal(props.analysis.filename);
  const [savePath, setSavePath] = createSignal(props.defaultSavePath);
  const [connections, setConnections] = createSignal(
    props.analysis.resumable ? props.defaultConnections : 1,
  );

  const icon = () => categoryIcons[props.analysis.category] ?? File;
  const ext = () => fileExtension(props.analysis.filename);
  const maxConn = () => (props.analysis.resumable ? 32 : 1);

  const handleBrowse = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({ directory: true, defaultPath: savePath() });
      if (selected) setSavePath(selected as string);
    } catch {
      // Browser mode or dialog cancelled — ignore
    }
  };

  const handleConfirm = () => {
    props.onConfirm({
      filename: filename(),
      savePath: savePath(),
      connections: connections(),
    });
  };

  return (
    <div class="flex flex-col">
      {/* Header */}
      <div class="flex items-center px-[20px] py-[16px] border-b border-inset">
        <span class="text-caption font-semibold text-tertiary uppercase tracking-[2px]">
          Download Confirmation
        </span>
      </div>

      {/* Body */}
      <div class="flex flex-col gap-[20px] p-[20px_24px]">
        {/* File Info Row */}
        <div class="flex gap-[16px]">
          {/* File icon */}
          <div class="flex flex-col items-center justify-center gap-[4px] w-[64px] h-[80px] rounded-md bg-inset shrink-0">
            {icon()({ size: 24, class: "text-accent" })}
            <Show when={ext()}>
              <span class="text-[9px] font-mono font-bold text-accent tracking-[1px]">
                {ext()}
              </span>
            </Show>
          </div>

          {/* File details */}
          <div class="flex flex-col gap-[6px] min-w-0 flex-1">
            <p class="text-heading-sm font-mono font-bold text-primary break-all leading-snug">
              {props.analysis.filename}
            </p>

            {/* Size · MIME */}
            <div class="flex items-center gap-[12px]">
              <Show when={props.analysis.total_size != null}>
                <span class="text-body font-mono font-semibold text-primary">
                  {formatSize(props.analysis.total_size!)}
                </span>
                <span class="w-[3px] h-[3px] rounded-full bg-muted" />
              </Show>
              <Show when={props.analysis.mime_type}>
                <span class="text-body-sm font-mono font-medium text-secondary">
                  {props.analysis.mime_type}
                </span>
              </Show>
            </div>

            {/* Badges */}
            <div class="flex items-center gap-[8px] flex-wrap">
              {/* Resumable */}
              <span
                class={`flex items-center gap-[4px] rounded px-[8px] py-[3px] text-[10px] font-mono font-semibold ${
                  props.analysis.resumable
                    ? "bg-success/20 text-success"
                    : "bg-error/20 text-error"
                }`}
              >
                {props.analysis.resumable
                  ? CircleCheck({ size: 12 })
                  : CircleX({ size: 12 })}
                {props.analysis.resumable ? "Resumable" : "Not Resumable"}
              </span>

              {/* Category */}
              <span class="flex items-center gap-[4px] rounded bg-accent/15 px-[8px] py-[3px] text-[10px] font-mono font-semibold text-accent">
                {icon()({ size: 12 })}
                {props.analysis.category.charAt(0).toUpperCase() + props.analysis.category.slice(1)}
              </span>

              {/* Server */}
              <Show when={props.analysis.server}>
                <span class="flex items-center gap-[4px] rounded bg-inset px-[8px] py-[3px] text-[10px] font-mono font-semibold text-muted">
                  <Server size={12} />
                  {props.analysis.server}
                </span>
              </Show>
            </div>

            {/* Source URL */}
            <p class="text-[10px] font-mono text-muted truncate">
              {props.analysis.url}
            </p>
          </div>
        </div>

        {/* Divider */}
        <div class="h-px bg-inset" />

        {/* Editable fields */}
        <div class="flex flex-col gap-[16px]">
          {/* Filename */}
          <div class="flex flex-col gap-[6px]">
            <label class="text-caption font-semibold text-tertiary uppercase tracking-[1px]">
              Filename
            </label>
            <div class="flex items-center gap-[8px] rounded-md bg-inset px-[12px] py-[10px] border border-inset focus-within:border-accent/50 transition-colors">
              <Pencil size={14} class="text-muted shrink-0" />
              <input
                type="text"
                value={filename()}
                onInput={(e) => setFilename(e.currentTarget.value)}
                class="flex-1 bg-transparent text-body font-mono font-medium text-primary outline-none"
              />
            </div>
          </div>

          {/* Save to */}
          <div class="flex flex-col gap-[6px]">
            <label class="text-caption font-semibold text-tertiary uppercase tracking-[1px]">
              Save to
            </label>
            <div class="flex items-center justify-between rounded-md bg-inset px-[12px] py-[10px] border border-inset">
              <span class="text-body font-mono font-medium text-primary truncate">
                {savePath()}
              </span>
              <button
                class="flex items-center gap-[4px] rounded bg-hover px-[8px] py-[4px] text-caption font-medium text-secondary hover:text-primary cursor-pointer transition-colors shrink-0 ml-[8px]"
                onClick={handleBrowse}
              >
                <FolderOpen size={12} />
                Browse
              </button>
            </div>
          </div>

          {/* Connections */}
          <div class="flex flex-col gap-[6px]">
            <label class="text-caption font-semibold text-tertiary uppercase tracking-[1px]">
              Connections
            </label>
            <div class="flex items-center justify-between">
              <span class="text-caption text-muted">
                Parallel download threads (1–32)
              </span>
              <div class="flex items-center rounded-md bg-inset border border-inset">
                <button
                  class="flex items-center justify-center px-[10px] py-[8px] text-secondary hover:text-primary cursor-pointer transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  onClick={() => setConnections((c) => Math.max(1, c - 1))}
                  disabled={connections() <= 1 || !props.analysis.resumable}
                >
                  <Minus size={14} />
                </button>
                <span class="text-body-lg font-mono font-bold text-accent px-[16px] py-[8px] border-x border-inset">
                  {connections()}
                </span>
                <button
                  class="flex items-center justify-center px-[10px] py-[8px] text-secondary hover:text-primary cursor-pointer transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  onClick={() => setConnections((c) => Math.min(maxConn(), c + 1))}
                  disabled={connections() >= maxConn()}
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div class="flex items-center justify-end gap-[12px] px-[24px] py-[16px] border-t border-inset">
        <button
          class="rounded-md bg-inset px-[20px] py-[10px] text-body-sm font-mono font-semibold text-secondary hover:text-primary hover:bg-hover cursor-pointer transition-colors"
          onClick={props.onCancel}
        >
          Cancel
        </button>
        <button
          class="flex items-center gap-[6px] rounded-md bg-accent px-[24px] py-[10px] text-body-sm font-mono font-semibold text-inverted hover:bg-accent/80 cursor-pointer transition-colors disabled:opacity-50"
          onClick={handleConfirm}
          disabled={props.submitting}
        >
          <Download size={14} />
          Download
        </button>
      </div>
    </div>
  );
};

export default ConfirmState;
