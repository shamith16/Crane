import type { Component } from "solid-js";

interface ProgressBarProps {
  /** 0–100 percentage */
  percent: number;
}

const ProgressBar: Component<ProgressBarProps> = (props) => {
  return (
    <div class="h-[3px] rounded-[3px] bg-inset overflow-hidden">
      <div
        class="h-full rounded-[3px] bg-accent transition-[width] duration-300"
        style={{ width: `${Math.min(100, Math.max(0, props.percent))}%` }}
      />
    </div>
  );
};

export default ProgressBar;
