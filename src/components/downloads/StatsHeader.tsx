import { createMemo } from "solid-js";
import type { Download, DownloadProgress } from "../../lib/types";
import { formatSpeed } from "../../lib/format";
import MaterialIcon from "../shared/MaterialIcon";

interface Props {
  downloads: Download[];
  progressMap: Record<string, DownloadProgress>;
}

export default function StatsHeader(props: Props) {
  const activeCount = createMemo(() =>
    props.downloads.filter((d) => d.status === "downloading" || d.status === "analyzing").length,
  );

  const completedTodayCount = createMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return props.downloads.filter(
      (d) => d.status === "completed" && d.completed_at?.startsWith(today),
    ).length;
  });

  const totalSpeed = createMemo(() => {
    let sum = 0;
    for (const dl of props.downloads) {
      if (dl.status === "downloading") {
        const p = props.progressMap[dl.id];
        sum += p ? p.speed : dl.speed;
      }
    }
    return sum;
  });

  return (
    <div class="flex items-center gap-3 px-5 py-3">
      {/* Active */}
      <div class="flex items-center gap-2 px-4 py-2 rounded-full bg-active/10 text-active text-sm font-medium">
        <MaterialIcon name="downloading" size={18} filled />
        <span class="tabular-nums">{activeCount()}</span>
        <span class="text-text-secondary text-xs">Active</span>
      </div>

      {/* Completed today */}
      <div class="flex items-center gap-2 px-4 py-2 rounded-full bg-surface text-text-secondary text-sm">
        <MaterialIcon name="check_circle" size={18} class="text-success" filled />
        <span class="tabular-nums">{completedTodayCount()}</span>
        <span class="text-xs">Today</span>
      </div>

      {/* Total speed */}
      <div class="flex items-center gap-2 px-4 py-2 rounded-full bg-surface text-text-secondary text-sm">
        <MaterialIcon name="speed" size={18} class="text-active" />
        <span class="tabular-nums">{formatSpeed(totalSpeed())}</span>
      </div>
    </div>
  );
}
