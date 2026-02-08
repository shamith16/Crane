import { For, createMemo } from "solid-js";
import type { ConnectionProgress } from "../../lib/types";

interface Props {
  connections: ConnectionProgress[];
  totalSize: number;
}

export default function ConnectionSegments(props: Props) {
  const segments = createMemo(() => {
    if (!props.totalSize || props.connections.length === 0) return [];

    // Sort connections by range_start
    const sorted = [...props.connections].sort(
      (a, b) => a.range_start - b.range_start,
    );

    return sorted.map((conn) => {
      const rangeSize = conn.range_end - conn.range_start;
      const widthPercent = (rangeSize / props.totalSize) * 100;
      const downloadedPercent =
        rangeSize > 0 ? (conn.downloaded / rangeSize) * 100 : 0;

      // Determine status: completed if downloaded >= range, active if has progress, pending otherwise
      let status: "completed" | "active" | "pending";
      if (conn.downloaded >= rangeSize) {
        status = "completed";
      } else if (conn.downloaded > 0) {
        status = "active";
      } else {
        status = "pending";
      }

      return {
        connectionNum: conn.connection_num,
        widthPercent: Math.max(widthPercent, 0.5), // Minimum visible width
        downloadedPercent: Math.min(downloadedPercent, 100),
        status,
      };
    });
  });

  return (
    <div class="w-full">
      <div class="flex h-3 rounded overflow-hidden gap-px bg-border">
        <For each={segments()}>
          {(seg) => (
            <div
              class="relative overflow-hidden"
              style={{ width: `${seg.widthPercent}%` }}
              title={`Connection ${seg.connectionNum}: ${Math.round(seg.downloadedPercent)}%`}
            >
              {/* Background (pending portion) */}
              <div class="absolute inset-0 bg-border" />
              {/* Filled portion */}
              <div
                class={`absolute inset-y-0 left-0 transition-all duration-300 ${
                  seg.status === "completed"
                    ? "bg-success"
                    : seg.status === "active"
                      ? "bg-active"
                      : "bg-border"
                }`}
                style={{ width: `${seg.downloadedPercent}%` }}
              />
            </div>
          )}
        </For>
      </div>
      {/* Legend */}
      <div class="flex items-center gap-3 mt-1.5 text-[10px] text-text-muted">
        <div class="flex items-center gap-1">
          <div class="w-2 h-2 rounded-sm bg-active" />
          <span>Active</span>
        </div>
        <div class="flex items-center gap-1">
          <div class="w-2 h-2 rounded-sm bg-success" />
          <span>Done</span>
        </div>
        <div class="flex items-center gap-1">
          <div class="w-2 h-2 rounded-sm bg-border" />
          <span>Pending</span>
        </div>
      </div>
    </div>
  );
}
