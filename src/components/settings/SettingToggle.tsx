import type { Component } from "solid-js";

interface SettingToggleProps {
  checked: boolean;
  onChange: (value: boolean) => void;
}

const SettingToggle: Component<SettingToggleProps> = (props) => {
  return (
    <button
      role="switch"
      aria-checked={props.checked}
      class={`relative w-[44px] h-[24px] rounded-full transition-colors cursor-pointer ${
        props.checked ? "bg-accent" : "bg-muted/30"
      }`}
      onClick={() => props.onChange(!props.checked)}
    >
      <div
        class={`absolute top-[2px] w-[20px] h-[20px] rounded-full bg-white transition-transform ${
          props.checked ? "translate-x-[22px]" : "translate-x-[2px]"
        }`}
      />
    </button>
  );
};

export default SettingToggle;
