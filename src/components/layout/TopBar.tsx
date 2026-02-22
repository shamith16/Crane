import type { Component } from "solid-js";

const TopBar: Component = () => {
  return (
    <div class="flex items-center h-[51px] shrink-0 px-lg gap-sm bg-inset border-b border-border">
      {/* L3 will fill this in — placeholder URL input area */}
      <div class="flex-1 h-[27px] rounded-md bg-surface px-md flex items-center">
        <span class="text-body-sm text-muted">Paste URL to start download...</span>
      </div>
      <div class="h-[27px] px-lg rounded-md bg-accent flex items-center">
        <span class="text-body-sm text-inverted font-medium">Add URL</span>
      </div>
    </div>
  );
};

export default TopBar;
