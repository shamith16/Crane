import type { Component } from "solid-js";
import { useLayout } from "./LayoutContext";

const DetailPanel: Component = () => {
  const { toggleDetailPanel } = useLayout();

  return (
    <aside class="w-[320px] shrink-0 bg-surface border-l border-border overflow-y-auto">
      {/* L7 will fill this in */}
      <div class="p-lg">
        <div class="flex items-center justify-between mb-lg">
          <span class="text-caption text-muted uppercase tracking-wider">Download Details</span>
          <button
            class="text-secondary hover:text-primary text-caption"
            onClick={toggleDetailPanel}
          >
            ✕
          </button>
        </div>
        <p class="text-body-sm text-secondary">Select a download to view details</p>
      </div>
    </aside>
  );
};

export default DetailPanel;
