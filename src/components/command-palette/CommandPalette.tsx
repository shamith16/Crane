import { createSignal, createMemo, For, Show } from "solid-js";
import { open } from "@tauri-apps/plugin-shell";
import { commandPaletteOpen, setCommandPaletteOpen, setSettingsOpen, toggleSidebar, setSelectedDownloadId } from "../../stores/ui";
import { pauseAll, resumeAll, deleteCompleted, getSettings } from "../../lib/commands";
import CommandItem from "./CommandItem";
import type { Command } from "./CommandItem";
import type { Download } from "../../lib/types";
import MaterialIcon from "../shared/MaterialIcon";

// ─── Group display labels ─────────────────────────

const GROUP_LABELS: Record<Command["group"], string> = {
  actions: "Actions",
  navigation: "Navigation",
  downloads: "Downloads",
};

const GROUP_ORDER: Command["group"][] = ["actions", "navigation", "downloads"];

// ─── Component ────────────────────────────────────

interface Props {
  downloads: Download[];
}

export default function CommandPalette(props: Props) {
  const [query, setQuery] = createSignal("");
  const [activeIndex, setActiveIndex] = createSignal(0);
  let inputRef: HTMLInputElement | undefined;
  let panelRef: HTMLDivElement | undefined;

  // Build static commands list
  function buildStaticCommands(): Command[] {
    return [
      {
        id: "add-url",
        label: "Add URL",
        group: "actions",
        icon: <MaterialIcon name="add" size={16} />,
        action: () => {
          close();
          // Focus the URL input field
          const input = document.querySelector<HTMLInputElement>('input[placeholder*="URL"], input[placeholder*="url"]');
          input?.focus();
        },
      },
      {
        id: "pause-all",
        label: "Pause All Downloads",
        group: "actions",
        shortcut: "\u2318\u21E7P",
        icon: <MaterialIcon name="pause" size={16} />,
        action: () => {
          close();
          pauseAll();
        },
      },
      {
        id: "resume-all",
        label: "Resume All Downloads",
        group: "actions",
        shortcut: "\u2318\u21E7R",
        icon: <MaterialIcon name="play_arrow" size={16} />,
        action: () => {
          close();
          resumeAll();
        },
      },
      {
        id: "clear-completed",
        label: "Clear Completed Downloads",
        group: "actions",
        icon: <MaterialIcon name="delete" size={16} />,
        action: () => {
          close();
          deleteCompleted();
        },
      },
      {
        id: "open-downloads-folder",
        label: "Open Downloads Folder",
        group: "actions",
        icon: <MaterialIcon name="folder_open" size={16} />,
        action: () => {
          close();
          getSettings().then((config) => {
            const loc = config.general.download_location;
            if (loc) {
              open(loc).catch(() => {});
            }
          }).catch(() => {});
        },
      },
      {
        id: "open-settings",
        label: "Open Settings",
        group: "navigation",
        shortcut: "\u2318,",
        icon: <MaterialIcon name="settings" size={16} />,
        action: () => {
          close();
          setSettingsOpen(true);
        },
      },
      {
        id: "toggle-sidebar",
        label: "Toggle Sidebar",
        group: "navigation",
        shortcut: "\u2318B",
        icon: <MaterialIcon name="side_navigation" size={16} />,
        action: () => {
          close();
          toggleSidebar();
        },
      },
    ];
  }

  // Build download commands from the downloads prop
  function buildDownloadCommands(): Command[] {
    return props.downloads.map((dl) => ({
      id: `dl-${dl.id}`,
      label: dl.filename,
      group: "downloads" as const,
      icon: <MaterialIcon name="insert_drive_file" size={16} />,
      action: () => {
        close();
        setSelectedDownloadId(dl.id);
      },
    }));
  }

  // Filtered and grouped results
  const filteredCommands = createMemo(() => {
    const q = query().toLowerCase().trim();
    const all = [...buildStaticCommands(), ...buildDownloadCommands()];

    if (!q) {
      // When no query, show static commands only (not the download list)
      return buildStaticCommands();
    }

    return all.filter((cmd) => cmd.label.toLowerCase().includes(q));
  });

  // Group commands for display, with a precomputed flat offset per group
  const groupedCommands = createMemo(() => {
    const cmds = filteredCommands();
    const groups: { group: Command["group"]; label: string; commands: Command[]; offset: number }[] = [];
    let offset = 0;

    for (const g of GROUP_ORDER) {
      const matching = cmds.filter((c) => c.group === g);
      if (matching.length > 0) {
        groups.push({ group: g, label: GROUP_LABELS[g], commands: matching, offset });
        offset += matching.length;
      }
    }

    return groups;
  });

  // Flat list for index-based navigation
  const flatList = createMemo(() => {
    return groupedCommands().flatMap((g) => g.commands);
  });

  function close() {
    setCommandPaletteOpen(false);
    setQuery("");
    setActiveIndex(0);
  }

  function executeActive() {
    const list = flatList();
    const idx = activeIndex();
    if (idx >= 0 && idx < list.length) {
      list[idx].action();
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    const list = flatList();

    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % Math.max(list.length, 1));
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + list.length) % Math.max(list.length, 1));
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      executeActive();
      return;
    }
  }

  // Reset active index when query changes
  function handleInput(value: string) {
    setQuery(value);
    setActiveIndex(0);
  }

  // Handle backdrop click
  function handleBackdropClick(e: MouseEvent) {
    if (panelRef && !panelRef.contains(e.target as Node)) {
      close();
    }
  }

  return (
    <Show when={commandPaletteOpen()}>
      <div
        class="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/50 backdrop-blur-sm"
        onClick={handleBackdropClick}
        onKeyDown={handleKeyDown}
      >
        <div
          ref={panelRef}
          class="w-full max-w-lg bg-surface border border-border rounded-2xl shadow-2xl overflow-hidden"
          role="dialog"
          aria-label="Command palette"
        >
          {/* Search input */}
          <div class="flex items-center gap-2 px-4 py-3 border-b border-border">
            <MaterialIcon name="search" size={16} class="text-text-muted shrink-0" />
            <input
              ref={(el) => {
                inputRef = el;
                // Auto-focus when the palette renders
                requestAnimationFrame(() => el.focus());
              }}
              type="text"
              placeholder="Type a command or search downloads..."
              class="flex-1 bg-transparent text-sm text-text-primary placeholder-text-muted outline-none"
              value={query()}
              onInput={(e) => handleInput(e.currentTarget.value)}
            />
            <kbd class="text-xs text-text-muted bg-bg px-1.5 py-0.5 rounded border border-border font-mono">
              esc
            </kbd>
          </div>

          {/* Results */}
          <div class="max-h-80 overflow-y-auto p-2">
            <Show
              when={flatList().length > 0}
              fallback={
                <div class="px-3 py-8 text-center text-sm text-text-muted">
                  No matching commands
                </div>
              }
            >
              <For each={groupedCommands()}>
                {(group) => (
                  <div class="mb-1">
                    <div class="px-3 py-1.5 text-xs font-medium text-text-muted uppercase tracking-wider">
                      {group.label}
                    </div>
                    <For each={group.commands}>
                      {(cmd, i) => {
                        const itemIndex = () => group.offset + i();
                        return (
                          <CommandItem
                            command={cmd}
                            active={activeIndex() === itemIndex()}
                            onExecute={() => cmd.action()}
                            onHover={() => setActiveIndex(itemIndex())}
                          />
                        );
                      }}
                    </For>
                  </div>
                )}
              </For>
            </Show>
          </div>
        </div>
      </div>
    </Show>
  );
}
