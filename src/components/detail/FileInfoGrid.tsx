import { Show, type Component } from "solid-js";
import type { Download } from "../../types/download";

interface FileInfoGridProps {
  download: Download;
}

function formatTime(isoString: string | null): string {
  if (!isoString) return "—";
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return "—";
  }
}

function shortenPath(path: string): string {
  return path.replace(/^\/Users\/[^/]+/, "~");
}

const InfoRow: Component<{ label: string; value: string; color?: string }> = (props) => (
  <div class="flex justify-between gap-[12px]">
    <span class="text-caption font-semibold text-tertiary tracking-wide shrink-0">{props.label}</span>
    <span class={`text-body-sm font-mono font-semibold text-right truncate ${props.color ?? "text-primary"}`}>
      {props.value}
    </span>
  </div>
);

const FileInfoGrid: Component<FileInfoGridProps> = (props) => {
  const dl = () => props.download;

  return (
    <div class="flex flex-col gap-[8px] rounded-md bg-inset p-[10px_12px]">
      <span class="text-caption font-semibold text-tertiary uppercase tracking-wider">
        File Info
      </span>
      <div class="flex flex-col gap-[6px]">
        <InfoRow label="Type" value={dl().mime_type ?? "Unknown"} />
        <InfoRow label="Save to" value={shortenPath(dl().save_path)} />
        <InfoRow label="Started" value={formatTime(dl().started_at)} />
        <InfoRow
          label="Resumable"
          value={dl().resumable ? "Yes" : "No"}
          color={dl().resumable ? "text-success" : "text-error"}
        />
      </div>
    </div>
  );
};

export default FileInfoGrid;
