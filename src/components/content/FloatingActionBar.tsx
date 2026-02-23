import { Show, For, type Component } from "solid-js";
import { Play, Pause, RotateCcw, Trash2, FolderOpen, X } from "lucide-solid";
import { useDownloads } from "../../stores/downloads";
import type { DownloadStatus } from "../../types/download";

type ActionDef = {
  id: string;
  label: string;
  icon: typeof Play;
  accent?: boolean;
  color?: string;
};

function getActions(statuses: DownloadStatus[]): ActionDef[] {
  const allActive = statuses.every((s) => s === "downloading" || s === "analyzing");
  const allPaused = statuses.every((s) => s === "paused");
  const allCompleted = statuses.every((s) => s === "completed");
  const allFailed = statuses.every((s) => s === "failed");

  const actions: ActionDef[] = [];

  if (allPaused) {
    actions.push({ id: "resume", label: "Resume All", icon: Play, accent: true });
    actions.push({ id: "cancel", label: "Cancel", icon: X });
  } else if (allActive) {
    actions.push({ id: "pause", label: "Pause All", icon: Pause, accent: true });
    actions.push({ id: "cancel", label: "Cancel", icon: X });
  } else if (allCompleted) {
    actions.push({ id: "open", label: "Open All", icon: FolderOpen, accent: true });
  } else if (allFailed) {
    actions.push({ id: "retry", label: "Retry All", icon: RotateCcw, accent: true });
  } else {
    // Mixed — show pause/resume if any applicable
    const hasActive = statuses.some((s) => s === "downloading" || s === "analyzing");
    const hasPaused = statuses.some((s) => s === "paused");
    if (hasActive) actions.push({ id: "pause", label: "Pause All", icon: Pause });
    if (hasPaused) actions.push({ id: "resume", label: "Resume All", icon: Play });
  }

  // Remove is always available
  actions.push({ id: "remove", label: "Remove", icon: Trash2, color: "text-error" });

  return actions;
}

const FloatingActionBar: Component = () => {
  const { selectedIds, selectedDownloads, clearSelection } = useDownloads();

  const count = () => selectedIds().size;
  const statuses = () => selectedDownloads().map((d) => d.status);
  const actions = () => getActions(statuses());

  return (
    <Show when={count() > 0}>
      <div
        class="absolute bottom-[16px] left-1/2 -translate-x-1/2 z-10 flex items-center gap-[16px] rounded-[12px] bg-surface border border-accent px-[20px] py-[10px]"
        style={{ "box-shadow": "0 4px 20px #22D3EE20" }}
      >
        {/* Selection count */}
        <span class="text-[12px] font-mono font-semibold text-accent whitespace-nowrap">
          {count()} selected
        </span>

        {/* Divider */}
        <div class="w-px h-[20px] bg-inset" />

        {/* Action buttons */}
        <For each={actions()}>
          {(action) => (
            <button
              class={`flex items-center gap-[6px] rounded-md px-[12px] py-[6px] text-[11px] font-mono font-semibold cursor-pointer transition-colors ${
                action.accent
                  ? "bg-accent text-inverted hover:bg-accent/80"
                  : `bg-inset ${action.color ?? "text-secondary"} hover:bg-hover`
              }`}
            >
              {action.icon({ size: 12 })}
              {action.label}
            </button>
          )}
        </For>

        {/* Close/clear button */}
        <button
          class="flex items-center justify-center w-[24px] h-[24px] rounded text-muted hover:text-primary hover:bg-hover transition-colors cursor-pointer"
          onClick={clearSelection}
        >
          <X size={12} />
        </button>
      </div>
    </Show>
  );
};

export default FloatingActionBar;
