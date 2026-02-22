import type { Component } from "solid-js";

const ContentArea: Component = () => {
  return (
    <div class="flex-1 overflow-y-auto p-lg">
      {/* L4 (empty state) and L5 (download list) will fill this in */}
      <div class="flex h-full items-center justify-center">
        <div class="text-center">
          <p class="text-heading text-secondary">Content Area</p>
          <p class="text-body-sm text-muted mt-xs">Downloads will appear here</p>
        </div>
      </div>
    </div>
  );
};

export default ContentArea;
