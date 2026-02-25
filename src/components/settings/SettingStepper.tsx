import type { Component } from "solid-js";
import { Minus, Plus } from "lucide-solid";

interface SettingStepperProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}

const SettingStepper: Component<SettingStepperProps> = (props) => {
  const step = () => props.step ?? 1;

  const decrement = () => {
    const next = props.value - step();
    if (next >= props.min) props.onChange(next);
  };

  const increment = () => {
    const next = props.value + step();
    if (next <= props.max) props.onChange(next);
  };

  return (
    <div class="flex items-center gap-0 rounded-md border border-border overflow-hidden">
      <button
        class="flex items-center justify-center w-[32px] h-[32px] bg-surface text-muted hover:text-primary hover:bg-hover transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
        onClick={decrement}
        disabled={props.value <= props.min}
      >
        <Minus size={12} />
      </button>
      <div class="flex items-center justify-center min-w-[48px] h-[32px] bg-inset text-caption font-mono font-extrabold text-primary px-[8px]">
        {props.value}
      </div>
      <button
        class="flex items-center justify-center w-[32px] h-[32px] bg-surface text-muted hover:text-primary hover:bg-hover transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
        onClick={increment}
        disabled={props.value >= props.max}
      >
        <Plus size={12} />
      </button>
    </div>
  );
};

export default SettingStepper;
