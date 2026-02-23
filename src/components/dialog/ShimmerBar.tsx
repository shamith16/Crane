import type { Component } from "solid-js";

interface ShimmerBarProps {
  width?: string;
}

const ShimmerBar: Component<ShimmerBarProps> = (props) => (
  <div
    class="h-[16px] rounded overflow-hidden bg-surface"
    style={{ width: props.width ?? "100%" }}
  >
    <div class="h-full w-full animate-shimmer bg-gradient-to-r from-surface via-hover to-surface" />
  </div>
);

export default ShimmerBar;
