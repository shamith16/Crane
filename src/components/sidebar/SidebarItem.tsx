import { Show, type Component, type JSX } from "solid-js";
import { useLayout } from "../layout/LayoutContext";

interface SidebarItemProps {
  icon: () => JSX.Element;
  label: string;
  count?: number;
  active?: boolean;
  onClick?: () => void;
}

const SidebarItem: Component<SidebarItemProps> = (props) => {
  const { sidebarExpanded } = useLayout();

  return (
    <button
      class={`flex items-center w-full rounded-md transition-colors cursor-pointer ${
        props.active
          ? "bg-accent/10 text-accent"
          : "text-secondary hover:bg-hover hover:text-primary"
      } ${sidebarExpanded() ? "gap-md px-md h-[32px]" : "justify-center h-[32px]"}`}
      onClick={props.onClick}
      title={sidebarExpanded() ? undefined : props.label}
    >
      <span class="shrink-0 w-[18px] h-[18px] flex items-center justify-center">
        {props.icon()}
      </span>

      <Show when={sidebarExpanded()}>
        <span class="text-body-sm flex-1 text-left truncate">{props.label}</span>
        <Show when={props.count !== undefined}>
          <span class={`text-caption tabular-nums ${props.active ? "text-accent" : "text-muted"}`}>
            {props.count}
          </span>
        </Show>
      </Show>
    </button>
  );
};

export default SidebarItem;
