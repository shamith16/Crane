import { Show, type Component, type JSX } from "solid-js";
import { useLayout } from "../layout/LayoutContext";

interface SidebarItemProps {
  icon: () => JSX.Element;
  label: string;
  count?: number;
  active?: boolean;
  trailing?: JSX.Element;
  onClick?: () => void;
}

const SidebarItem: Component<SidebarItemProps> = (props) => {
  const { sidebarExpanded } = useLayout();

  return (
    <button
      class={`flex items-center w-full rounded-lg transition-colors cursor-pointer ${
        props.active
          ? "bg-accent/15 text-accent"
          : "text-secondary hover:bg-surface/50 hover:text-primary"
      } ${sidebarExpanded() ? "gap-md px-[10px] h-[34px]" : "justify-center h-[34px]"}`}
      onClick={props.onClick}
      title={sidebarExpanded() ? undefined : props.label}
    >
      <span class="shrink-0 w-[18px] h-[18px] flex items-center justify-center">
        {props.icon()}
      </span>

      <Show when={sidebarExpanded()}>
        <span class={`text-body-sm flex-1 text-left truncate ${props.active ? "font-semibold" : ""}`}>
          {props.label}
        </span>
        <Show when={props.count !== undefined}>
          <span class={`text-caption font-mono font-extrabold tabular-nums ${props.active ? "text-accent" : "text-muted"}`}>
            {props.count}
          </span>
        </Show>
        <Show when={props.trailing}>
          {props.trailing}
        </Show>
      </Show>
    </button>
  );
};

export default SidebarItem;
