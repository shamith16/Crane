import { Show, createEffect, createSignal } from "solid-js";
import { selectedDownloadId, closeDetailPanel } from "../../stores/ui";
import { getDownload } from "../../lib/commands";
import type { Download } from "../../lib/types";

export default function DetailPanel() {
  const [download, setDownload] = createSignal<Download | null>(null);

  createEffect(() => {
    const id = selectedDownloadId();
    if (id) {
      getDownload(id)
        .then((dl) => setDownload(dl))
        .catch(() => setDownload(null));
    } else {
      setDownload(null);
    }
  });

  return (
    <Show when={selectedDownloadId()}>
      <div class="w-80 flex-shrink-0 bg-surface border-l border-border flex flex-col overflow-y-auto">
        {/* Header */}
        <div class="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 class="text-sm font-medium text-text-primary truncate flex-1">
            {download()?.filename ?? "Loading..."}
          </h2>
          <button
            onClick={closeDetailPanel}
            class="ml-2 flex-shrink-0 w-6 h-6 flex items-center justify-center rounded hover:bg-surface-hover text-text-muted hover:text-text-primary transition-colors"
          >
            {"\u2715"}
          </button>
        </div>

        {/* Basic info */}
        <Show when={download()}>
          {(dl) => (
            <div class="px-4 py-3 space-y-3">
              <div>
                <p class="text-[10px] uppercase tracking-wider text-text-muted mb-0.5">Status</p>
                <p class="text-xs text-text-primary">{dl().status}</p>
              </div>
              <div>
                <p class="text-[10px] uppercase tracking-wider text-text-muted mb-0.5">URL</p>
                <p class="text-xs text-text-secondary break-all line-clamp-3">{dl().url}</p>
              </div>
              <div>
                <p class="text-[10px] uppercase tracking-wider text-text-muted mb-0.5">Category</p>
                <p class="text-xs text-text-primary">{dl().category}</p>
              </div>
              {/* Full content will be implemented in Task 9 */}
            </div>
          )}
        </Show>
      </div>
    </Show>
  );
}
