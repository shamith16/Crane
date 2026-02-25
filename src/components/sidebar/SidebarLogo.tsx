import type { Component } from "solid-js";
import { Show } from "solid-js";
import { useLayout } from "../layout/LayoutContext";
import CraneIcon from "./CraneIcon";

const SidebarLogo: Component = () => {
  const { sidebarExpanded } = useLayout();

  return (
    <div class={`flex items-center h-[22px] ${sidebarExpanded() ? "gap-sm" : "justify-center"}`}>
      <CraneIcon size={28} class="text-accent shrink-0" />
      <Show when={sidebarExpanded()}>
        <span class="text-brand font-mono font-black text-primary tracking-[3px]">CRANE</span>
      </Show>
    </div>
  );
};

export default SidebarLogo;
