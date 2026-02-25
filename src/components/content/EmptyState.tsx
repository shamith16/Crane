import type { Component } from "solid-js";
import { CloudDownload } from "lucide-solid";

const EmptyState: Component = () => {
  return (
    <div class="flex flex-col items-center justify-center h-full gap-md">
      <CloudDownload size={48} class="text-muted" />
      <div class="text-center">
        <p class="text-empty text-secondary font-semibold">No downloads yet</p>
        <p class="text-body-sm text-muted mt-xs">Paste a URL above to get started</p>
      </div>
    </div>
  );
};

export default EmptyState;
