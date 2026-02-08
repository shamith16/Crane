import type { JSX } from "solid-js";

export interface Command {
  id: string;
  label: string;
  group: "actions" | "navigation" | "downloads";
  shortcut?: string;
  icon?: JSX.Element;
  action: () => void;
}

interface Props {
  command: Command;
  active: boolean;
  onExecute: () => void;
  onHover: () => void;
}

/** Renders a single row in the command palette list. */
export default function CommandItem(props: Props) {
  return (
    <button
      class={`w-full flex items-center gap-3 px-3 py-2 text-left rounded-md transition-colors ${
        props.active ? "bg-active/15 text-active" : "text-text-primary hover:bg-surface-hover"
      }`}
      onMouseEnter={props.onHover}
      onMouseDown={(e) => {
        // Prevent blur on the search input
        e.preventDefault();
      }}
      onClick={props.onExecute}
    >
      {/* Icon */}
      <span class="w-5 h-5 flex items-center justify-center shrink-0 text-text-secondary">
        {props.command.icon}
      </span>

      {/* Label */}
      <span class="flex-1 truncate text-sm">{props.command.label}</span>

      {/* Shortcut badge */}
      {props.command.shortcut && (
        <kbd class="text-xs text-text-muted bg-surface px-1.5 py-0.5 rounded border border-border font-mono shrink-0">
          {props.command.shortcut}
        </kbd>
      )}
    </button>
  );
}
