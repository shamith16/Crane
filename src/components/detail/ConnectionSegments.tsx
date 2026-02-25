import { Show, For, type Component } from "solid-js";
import type { ConnectionProgress } from "../../types/download";

interface ConnectionSegmentsProps {
  connections: ConnectionProgress[];
}

function percent(conn: ConnectionProgress): number {
  const total = conn.range_end - conn.range_start;
  if (total === 0) return 0;
  return Math.round((conn.downloaded / total) * 100);
}

/** Row layout — one horizontal bar per segment. Used for ≤ 8 connections. */
const RowView: Component<{ connections: ConnectionProgress[] }> = (props) => (
  <div class="flex flex-col gap-[4px]">
    <For each={props.connections}>
      {(conn) => (
        <div class="flex items-center gap-[6px]">
          <span class="text-mini font-mono font-medium text-muted w-[20px] shrink-0">
            #{conn.connection_num}
          </span>
          <div class="flex-1 h-[4px] rounded-sm bg-surface overflow-hidden">
            <div
              class="h-full rounded-sm bg-accent transition-[width] duration-300"
              style={{ width: `${percent(conn)}%` }}
            />
          </div>
          <span class="text-mini font-mono font-medium text-secondary w-[28px] text-right shrink-0">
            {percent(conn)}%
          </span>
        </div>
      )}
    </For>
  </div>
);

/** Mini-bar grid — compact vertical bars. Used for > 8 connections. */
const GridView: Component<{ connections: ConnectionProgress[] }> = (props) => {
  const cols = () => {
    const n = props.connections.length;
    if (n <= 16) return n;
    return Math.ceil(n / Math.ceil(n / 16));
  };

  return (
    <div
      class="grid gap-[3px]"
      style={{ "grid-template-columns": `repeat(${cols()}, 1fr)` }}
    >
      <For each={props.connections}>
        {(conn) => {
          const pct = () => percent(conn);
          return (
            <div
              class="relative h-[36px] rounded-[3px] bg-surface/40 border border-accent/20 overflow-hidden group cursor-default"
              title={`#${conn.connection_num} — ${pct()}%`}
            >
              <div
                class="absolute bottom-0 left-0 right-0 bg-accent transition-[height] duration-300"
                style={{ height: `${pct()}%` }}
              />
              <div class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <span class="text-[8px] font-mono font-bold text-white rounded-sm bg-page/80 px-[2px]">
                  {pct()}
                </span>
              </div>
            </div>
          );
        }}
      </For>
    </div>
  );
};

const ConnectionSegments: Component<ConnectionSegmentsProps> = (props) => {
  const count = () => props.connections.length;

  return (
    <div class="flex flex-col gap-[8px] pb-[4px]">
      <div class="flex items-center justify-between">
        <span class="text-caption font-semibold text-tertiary uppercase tracking-wider">
          Segments
        </span>
        <Show when={count() > 8}>
          <span class="text-mini font-mono font-medium text-muted">{count()} connections</span>
        </Show>
      </div>
      <Show when={count() <= 8} fallback={<GridView connections={props.connections} />}>
        <RowView connections={props.connections} />
      </Show>
    </div>
  );
};

export default ConnectionSegments;
