import { For, type Component } from "solid-js";
import type { ConnectionProgress } from "../../types/download";

interface ConnectionSegmentsProps {
  connections: ConnectionProgress[];
}

const ConnectionSegments: Component<ConnectionSegmentsProps> = (props) => {
  const percent = (conn: ConnectionProgress) => {
    const total = conn.range_end - conn.range_start;
    if (total === 0) return 0;
    return Math.round((conn.downloaded / total) * 100);
  };

  return (
    <div class="flex flex-col gap-[8px]">
      <span class="text-caption font-semibold text-tertiary uppercase tracking-wider">
        Segments
      </span>
      <div class="flex flex-col gap-[4px]">
        <For each={props.connections}>
          {(conn) => (
            <div class="flex items-center gap-[6px]">
              <span class="text-[10px] font-mono font-medium text-muted w-[20px] shrink-0">
                #{conn.connection_num}
              </span>
              <div class="flex-1 h-[4px] rounded-sm bg-surface overflow-hidden">
                <div
                  class="h-full rounded-sm bg-accent transition-[width] duration-300"
                  style={{ width: `${percent(conn)}%` }}
                />
              </div>
              <span class="text-[10px] font-mono font-medium text-secondary w-[28px] text-right shrink-0">
                {percent(conn)}%
              </span>
            </div>
          )}
        </For>
      </div>
    </div>
  );
};

export default ConnectionSegments;
