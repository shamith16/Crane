import { createSignal, Show, type ParentComponent } from "solid-js";
import { ChevronDown, ChevronRight } from "lucide-solid";

interface SectionHeaderProps {
  label: string;
  count: number;
}

const SectionHeader: ParentComponent<SectionHeaderProps> = (props) => {
  const [expanded, setExpanded] = createSignal(true);

  return (
    <div class="flex flex-col gap-[8px]">
      <button
        class="flex items-center justify-between w-full cursor-pointer group"
        onClick={() => setExpanded((v) => !v)}
      >
        <div class="flex items-center gap-[8px]">
          {expanded() ? (
            <ChevronDown size={14} class="text-tertiary" />
          ) : (
            <ChevronRight size={14} class="text-tertiary" />
          )}
          <span class="text-caption font-semibold text-tertiary uppercase tracking-wider">
            {props.label}
          </span>
        </div>
        <span class="text-caption font-medium text-muted font-mono">
          {props.count} {props.count === 1 ? "download" : "downloads"}
        </span>
      </button>

      <Show when={expanded()}>
        {props.children}
      </Show>
    </div>
  );
};

export default SectionHeader;
