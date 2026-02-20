import { createMemo, createSignal, onMount, onCleanup } from "solid-js";
import type { Download, DownloadProgress } from "../../lib/types";
import { formatSpeed, formatSize } from "../../lib/format";
import { getDiskSpace } from "../../lib/commands";

interface Props {
  downloads: Download[];
  progressMap: Record<string, DownloadProgress>;
}

export default function StatusBar(props: Props) {
  const [diskFree, setDiskFree] = createSignal<number | null>(null);
  const [diskTotal, setDiskTotal] = createSignal<number | null>(null);

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

  // Poll disk space every 30s
  onMount(() => {
    function fetchDisk() {
      getDiskSpace().then((ds) => {
        setDiskFree(ds.free_bytes);
        setDiskTotal(ds.total_bytes);
      }).catch(() => {});
    }
    fetchDisk();
    const interval = setInterval(fetchDisk, 30_000);
    onCleanup(() => clearInterval(interval));
  });

  return (
    <div class="h-9 flex items-center justify-between px-5 bg-surface border-t border-border text-xs text-text-secondary shrink-0">
      {/* Left: connection status */}
      <div class="flex items-center gap-2">
        <div class="w-2 h-2 rounded-full bg-active" />
        <span>Connected</span>
      </div>

      {/* Center: total speed */}
      <div class="tabular-nums">
        Total Speed: {formatSpeed(totalSpeed())}
      </div>

      {/* Right: free space */}
      <div class="tabular-nums">
        {diskFree() !== null
          ? `Free Space: ${formatSize(diskFree()!)}`
          : ""}
      </div>
    </div>
  );
}
