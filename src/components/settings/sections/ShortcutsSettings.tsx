import { createSignal, createMemo, For } from "solid-js";
import { Search } from "lucide-solid";

interface Shortcut {
  keys: string;
  description: string;
}

const SHORTCUTS: Shortcut[] = [
  { keys: "\u2318K", description: "Open command palette" },
  { keys: "\u2318,", description: "Open settings" },
  { keys: "\u2318B", description: "Toggle sidebar" },
  { keys: "\u2318\u21E7P", description: "Pause all downloads" },
  { keys: "\u2318\u21E7R", description: "Resume all downloads" },
  { keys: "Escape", description: "Close panel / modal / deselect" },
  { keys: "\u2318A", description: "Select all downloads" },
  { keys: "\u2318O", description: "Open file" },
  { keys: "\u2318V", description: "Paste URL and start analysis" },
  { keys: "\u2318\u21E7O", description: "Open containing folder" },
];

export default function ShortcutsSettings() {
  const [search, setSearch] = createSignal("");

  const filteredShortcuts = createMemo(() => {
    const q = search().toLowerCase().trim();
    if (!q) return SHORTCUTS;
    return SHORTCUTS.filter(
      (s) =>
        s.description.toLowerCase().includes(q) ||
        s.keys.toLowerCase().includes(q),
    );
  });

  return (
    <div class="max-w-2xl space-y-6">
      <h2 class="text-base font-semibold text-text-primary">
        Keyboard Shortcuts
      </h2>

      {/* Search */}
      <div class="relative">
        <Search size={16} stroke-width={1.75} class="text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          class="w-full bg-surface border border-border rounded-lg pl-9 pr-3 py-2 text-sm text-text-primary placeholder-text-muted outline-none focus:border-active"
          placeholder="Search shortcuts..."
          value={search()}
          onInput={(e) => setSearch(e.currentTarget.value)}
        />
      </div>

      {/* Shortcuts List */}
      <div class="bg-surface border border-border rounded-lg divide-y divide-border overflow-hidden">
        <For
          each={filteredShortcuts()}
          fallback={
            <div class="px-4 py-6 text-center text-sm text-text-muted">
              No shortcuts match your search
            </div>
          }
        >
          {(shortcut) => (
            <div class="flex items-center justify-between px-4 py-3">
              <span class="text-sm text-text-primary">
                {shortcut.description}
              </span>
              <kbd class="text-xs text-text-secondary bg-bg px-2 py-1 rounded border border-border font-mono">
                {shortcut.keys}
              </kbd>
            </div>
          )}
        </For>
      </div>

      <div class="text-xs text-text-muted">
        Keyboard shortcuts are read-only. Custom keybindings will be available
        in a future update.
      </div>
    </div>
  );
}
