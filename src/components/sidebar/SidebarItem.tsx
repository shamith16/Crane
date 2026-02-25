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
      class={`flex items-center w-full transition-colors cursor-pointer ${
        props.active
          ? "bg-surface text-primary font-medium border-l-[3px] border-accent"
          : "text-secondary hover:bg-surface/50 hover:text-primary"
      } ${sidebarExpanded() ? `gap-md ${props.active ? "pl-[9px] pr-md" : "px-md"} h-[36px]` : "justify-center h-[36px]"}`}
      onClick={props.onClick}
      title={sidebarExpanded() ? undefined : props.label}
    >
      <span class={`shrink-0 w-[18px] h-[18px] flex items-center justify-center ${props.active ? "text-accent" : ""}`}>
        {props.icon()}
      </span>

      <Show when={sidebarExpanded()}>
        <span class="text-body-sm flex-1 text-left truncate">{props.label}</span>
        <Show when={props.count !== undefined}>
          <span class={`text-caption font-mono font-semibold tabular-nums ${props.active ? "text-accent" : "text-muted"}`}>
            {props.count}
          </span>
        </Show>
      </Show>
    </button>
  );
};

export default SidebarItem;
