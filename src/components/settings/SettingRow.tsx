import { Show, type ParentComponent, type JSX } from "solid-js";

interface SettingRowProps {
  label: string;
  description?: string;
  children: JSX.Element;
}

const SettingRow: ParentComponent<SettingRowProps> = (props) => {
  return (
    <div class="flex items-center justify-between gap-[16px] py-[12px]">
      <div class="flex flex-col gap-[2px] min-w-0">
        <span class="text-body font-medium text-primary">{props.label}</span>
        <Show when={props.description}>
          <span class="text-caption text-muted">{props.description}</span>
        </Show>
      </div>
      <div class="shrink-0">{props.children}</div>
    </div>
  );
};

export default SettingRow;
