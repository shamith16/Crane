import type { Component } from "solid-js";
import { useLayout } from "./LayoutContext";

const Sidebar: Component = () => {
  const { sidebarExpanded, toggleSidebar } = useLayout();

  return (
    <aside
      class="flex flex-col bg-inset border-r border-border transition-all duration-200 ease-in-out shrink-0 overflow-hidden"
      style={{ width: sidebarExpanded() ? "240px" : "64px" }}
    >
      {/* L2 will fill this in — temp toggle until keyboard shortcut is added */}
      <div class="flex-1 p-lg">
        <button
          class="text-secondary hover:text-primary text-caption"
          onClick={toggleSidebar}
        >
          {sidebarExpanded() ? "« Collapse" : "»"}
        </button>
      </div>

      {/* Disk usage area */}
      <div class="p-lg border-t border-border">
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
    </aside>
  );
};

export default Sidebar;
