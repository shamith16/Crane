import { Show } from "solid-js";
import {
  selectedIds,
  clearSelection,
} from "../../stores/ui";
import {
  pauseDownload,
  resumeDownload,
  deleteDownload,
} from "../../lib/commands";

interface Props {
  onRefresh: () => void;
}

export default function FloatingActionBar(props: Props) {
  const count = () => selectedIds().size;

  async function handlePauseSelected() {
    const ids = Array.from(selectedIds());
    const results = await Promise.allSettled(ids.map((id) => pauseDownload(id)));
    const failures = results.filter((r) => r.status === "rejected");
    if (failures.length > 0) {
      console.error(`${failures.length} pause(s) failed:`, failures);
    }
    props.onRefresh();
  }

  async function handleResumeSelected() {
    const ids = Array.from(selectedIds());
    const results = await Promise.allSettled(ids.map((id) => resumeDownload(id)));
    const failures = results.filter((r) => r.status === "rejected");
    if (failures.length > 0) {
      console.error(`${failures.length} resume(s) failed:`, failures);
    }
    props.onRefresh();
  }

  async function handleDeleteSelected() {
    const ids = Array.from(selectedIds());
    const results = await Promise.allSettled(ids.map((id) => deleteDownload(id, false)));
    const failures = results.filter((r) => r.status === "rejected");
    if (failures.length > 0) {
      console.error(`${failures.length} delete(s) failed:`, failures);
    }
    clearSelection();
    props.onRefresh();
  }

  return (
    <Show when={count() > 0}>
      <div class="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2.5 bg-surface border border-border rounded-lg shadow-lg">
        <span class="text-sm text-text-secondary tabular-nums">
          {count()} selected
        </span>
        <div class="w-px h-4 bg-border" />
        <button
          onClick={handlePauseSelected}
          class="px-3 py-1 text-xs bg-border hover:bg-surface-hover text-text-primary rounded transition-colors"
        >
          Pause
        </button>
        <button
          onClick={handleResumeSelected}
          class="px-3 py-1 text-xs bg-border hover:bg-surface-hover text-text-primary rounded transition-colors"
        >
          Resume
        </button>
        <button
          onClick={handleDeleteSelected}
          class="px-3 py-1 text-xs bg-error/20 hover:bg-error/30 text-error rounded transition-colors"
        >
          Delete
        </button>
        <div class="w-px h-4 bg-border" />
        <button
          onClick={clearSelection}
          class="px-2 py-1 text-xs text-text-muted hover:text-text-primary transition-colors"
        >
          Clear
        </button>
      </div>
    </Show>
  );
}
