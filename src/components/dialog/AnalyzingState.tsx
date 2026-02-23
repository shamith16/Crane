import type { Component } from "solid-js";
import { Loader } from "lucide-solid";
import ShimmerBar from "./ShimmerBar";

interface AnalyzingStateProps {
  url: string;
  onCancel: () => void;
}

const SKELETON_ROWS: { label: string; width: string }[] = [
  { label: "Filename", width: "100%" },
  { label: "File Size", width: "120px" },
  { label: "MIME Type", width: "160px" },
  { label: "Resumable", width: "80px" },
  { label: "Server", width: "200px" },
];

const AnalyzingState: Component<AnalyzingStateProps> = (props) => (
  <div class="flex flex-col gap-[20px] p-[28px_32px]">
    {/* Header */}
    <div class="flex items-center gap-[10px]">
      <Loader size={20} class="text-accent animate-spin-slow" />
      <span class="text-heading font-semibold text-primary">Analyzing URL...</span>
    </div>

    {/* Divider */}
    <div class="h-px bg-inset" />

    {/* URL box */}
    <div class="rounded-md bg-inset p-[10px_14px]">
      <p class="text-body font-mono text-secondary break-all">{props.url}</p>
    </div>

    {/* Shimmer skeleton rows */}
    <div class="flex flex-col gap-[14px]">
      {SKELETON_ROWS.map((row) => (
        <div class="flex items-center gap-[12px]">
          <span class="text-body-sm font-medium text-tertiary w-[90px] shrink-0">
            {row.label}
          </span>
          <ShimmerBar width={row.width} />
        </div>
      ))}
    </div>

    {/* Divider */}
    <div class="h-px bg-inset" />

    {/* Cancel button */}
    <div class="flex justify-end">
      <button
        class="rounded-md bg-inset px-[16px] h-[38px] text-body-lg font-medium text-secondary hover:text-primary hover:bg-hover cursor-pointer transition-colors"
        onClick={props.onCancel}
      >
        Cancel
      </button>
    </div>
  </div>
);

export default AnalyzingState;
