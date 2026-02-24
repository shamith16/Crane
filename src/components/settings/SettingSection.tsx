import { Show, type ParentComponent, type JSX } from "solid-js";

interface SettingSectionProps {
  title: string;
  description?: string;
  children: JSX.Element;
}

const SettingSection: ParentComponent<SettingSectionProps> = (props) => {
  return (
    <div class="flex flex-col gap-[4px]">
      <div class="flex flex-col gap-[2px] mb-[4px]">
        <h3 class="text-body font-semibold text-primary">{props.title}</h3>
        <Show when={props.description}>
          <p class="text-caption text-muted">{props.description}</p>
        </Show>
      </div>
      <div class="flex flex-col divide-y divide-border">
        {props.children}
      </div>
    </div>
  );
};

export default SettingSection;
