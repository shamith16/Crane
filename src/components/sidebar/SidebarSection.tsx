import { Show, type ParentComponent } from "solid-js";
import { useLayout } from "../layout/LayoutContext";

interface SidebarSectionProps {
  label: string;
}

const SidebarSection: ParentComponent<SidebarSectionProps> = (props) => {
  const { sidebarExpanded } = useLayout();

  return (
    <div class="flex flex-col gap-xs">
      <Show when={sidebarExpanded()}>
        <span class="text-caption text-muted uppercase tracking-wider px-md mb-xs">
          {props.label}
        </span>
      </Show>
      {props.children}
    </div>
  );
};

export default SidebarSection;
