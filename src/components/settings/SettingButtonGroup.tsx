import { For, type Component } from "solid-js";

interface SettingButtonGroupProps {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}

const SettingButtonGroup: Component<SettingButtonGroupProps> = (props) => {
  return (
    <div class="flex items-center rounded-full bg-inset p-[2px] gap-[2px]">
      <For each={props.options}>
        {(opt) => (
          <button
            class={`px-[12px] py-[6px] text-caption font-mono font-medium rounded-full transition-colors cursor-pointer ${
              props.value === opt.value
                ? "bg-accent text-inverted"
                : "text-muted hover:text-primary"
            }`}
            onClick={() => props.onChange(opt.value)}
          >
            {opt.label}
          </button>
        )}
      </For>
    </div>
  );
};

export default SettingButtonGroup;
