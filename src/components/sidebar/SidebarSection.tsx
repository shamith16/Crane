import { Show, type ParentComponent } from "solid-js";
import { useLayout } from "../layout/LayoutContext";

interface SidebarSectionProps {
  label: string;
}

const SidebarSection: ParentComponent<SidebarSectionProps> = (props) => {
  const { sidebarExpanded } = useLayout();

  return (
    <div class="flex flex-col gap-[2px]">
      <Show when={sidebarExpanded()}>
        <span class="text-caption text-muted uppercase tracking-wider px-[10px] mb-[2px]">
          {props.label}
        </span>
      </Show>
      <div class="flex flex-col gap-[2px]">
        {props.children}
      </div>
    </div>
  );
};

export default SidebarSection;
