import type { Component } from "solid-js";
import { Show } from "solid-js";
import { CloudDownload } from "lucide-solid";
import { useLayout } from "../layout/LayoutContext";

const SidebarLogo: Component = () => {
  const { sidebarExpanded } = useLayout();

  return (
    <div class={`flex items-center h-[22px] ${sidebarExpanded() ? "gap-sm" : "justify-center"}`}>
      <CloudDownload size={18} class="text-accent shrink-0" />
      <Show when={sidebarExpanded()}>
        <span class="text-body-lg font-bold text-primary tracking-wider">CRANE</span>
      </Show>
    </div>
  );
};

export default SidebarLogo;
