import { For, type Component } from "solid-js";
import { ChevronDown } from "lucide-solid";

interface SettingSelectProps {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}

const SettingSelect: Component<SettingSelectProps> = (props) => {
  return (
    <div class="relative">
      <select
        value={props.value}
        onChange={(e) => props.onChange(e.currentTarget.value)}
        class="appearance-none bg-surface border border-border rounded-md px-[12px] py-[6px] pr-[32px] text-caption font-mono text-primary cursor-pointer hover:border-accent/50 transition-colors focus:outline-none focus:border-accent"
      >
        <For each={props.options}>
          {(opt) => <option value={opt.value}>{opt.label}</option>}
        </For>
      </select>
      <ChevronDown size={14} class="absolute right-[10px] top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
    </div>
  );
};

export default SettingSelect;
