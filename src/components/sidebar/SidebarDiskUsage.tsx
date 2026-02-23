import type { Component } from "solid-js";
import { useLayout } from "../layout/LayoutContext";

const SidebarDiskUsage: Component = () => {
  const { sidebarExpanded } = useLayout();

  return (
    <div class="border-t border-border p-lg">
      {sidebarExpanded() ? (
        <div class="flex flex-col gap-xs">
          <span class="text-caption text-muted uppercase tracking-wider">Disk Usage</span>
          <div class="h-[4px] rounded-full bg-surface overflow-hidden">
            <div class="h-full w-[34%] rounded-full bg-accent" />
          </div>
          <div class="flex justify-between">
            <span class="text-caption text-secondary">342 GB</span>
            <span class="text-caption text-muted">1 TB</span>
          </div>
        </div>
      ) : (
        <div class="flex flex-col items-center gap-xs">
          <span class="text-body-sm font-semibold text-secondary">342</span>
          <span class="text-caption text-muted">GB</span>
        </div>
      )}
    </div>
  );
};

export default SidebarDiskUsage;
