import { type Component } from "solid-js";
import { Link, ClipboardPaste } from "lucide-solid";

const TopBar: Component = () => {
  return (
    <div class="flex items-center h-[48px] shrink-0 px-lg gap-sm bg-inset border-b border-border">
      <Link size={16} class="text-muted shrink-0" />

      <input
        type="text"
        placeholder="Paste URL to start download..."
        class="flex-1 bg-transparent text-body text-primary placeholder:text-muted outline-none"
      />

      <button class="flex items-center gap-xs bg-accent hover:bg-accent/80 text-inverted rounded-md px-md py-xs cursor-pointer transition-colors shrink-0">
        <ClipboardPaste size={14} />
        <span class="text-caption font-semibold tracking-wider">ADD URL</span>
      </button>
    </div>
  );
};

export default TopBar;
