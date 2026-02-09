import { createSignal, createMemo, For } from "solid-js";

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
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          class="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2"
        >
          <path
            fill-rule="evenodd"
            d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z"
            clip-rule="evenodd"
          />
        </svg>
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
