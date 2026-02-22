import type { Component } from "solid-js";

const StatusBar: Component = () => {
  return (
    <div class="flex items-center justify-between h-[36px] shrink-0 px-lg bg-inset border-t border-border">
      {/* Left: connection status + download count */}
      <div class="flex items-center gap-sm">
        <div class="w-[6px] h-[6px] rounded-full bg-success" />
        <span class="text-caption text-secondary">Connected</span>
        <span class="text-caption text-muted">·</span>
        <span class="text-caption text-secondary">8 Downloads</span>
      </div>

      {/* Right: speed */}
      <div class="flex items-center gap-sm">
        <span class="text-caption text-secondary">↓ 21.3 MB/s</span>
      </div>
    </div>
  );
};

export default StatusBar;
