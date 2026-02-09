import { createSignal, createMemo, For, Show } from "solid-js";
import { open } from "@tauri-apps/plugin-shell";
import { commandPaletteOpen, setCommandPaletteOpen, setSettingsOpen, toggleSidebar, setSelectedDownloadId } from "../../stores/ui";
import { pauseAll, resumeAll, deleteCompleted, getSettings } from "../../lib/commands";
import CommandItem from "./CommandItem";
import type { Command } from "./CommandItem";
import type { Download } from "../../lib/types";

// ─── SVG icon helpers ─────────────────────────────

function PlusIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
      <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
      <path d="M5.75 3a.75.75 0 0 0-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 0 0 .75-.75V3.75A.75.75 0 0 0 7.25 3h-1.5ZM12.75 3a.75.75 0 0 0-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 0 0 .75-.75V3.75a.75.75 0 0 0-.75-.75h-1.5Z" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
      <path d="M6.3 2.84A1.5 1.5 0 0 0 4 4.11v11.78a1.5 1.5 0 0 0 2.3 1.27l9.344-5.891a1.5 1.5 0 0 0 0-2.538L6.3 2.841Z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
      <path fill-rule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 1 .7.798l-.2 4.5a.75.75 0 0 1-1.497-.067l.2-4.5a.75.75 0 0 1 .797-.73Zm3.638.798a.75.75 0 0 0-1.497-.066l-.2 4.5a.75.75 0 1 0 1.497.066l.2-4.5Z" clip-rule="evenodd" />
    </svg>
  );
}

function CogIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
      <path fill-rule="evenodd" d="M7.84 1.804A1 1 0 0 1 8.82 1h2.36a1 1 0 0 1 .98.804l.331 1.652a6.993 6.993 0 0 1 1.929 1.115l1.598-.54a1 1 0 0 1 1.186.447l1.18 2.044a1 1 0 0 1-.205 1.251l-1.267 1.113a7.047 7.047 0 0 1 0 2.228l1.267 1.113a1 1 0 0 1 .206 1.25l-1.18 2.045a1 1 0 0 1-1.187.447l-1.598-.54a6.993 6.993 0 0 1-1.929 1.115l-.33 1.652a1 1 0 0 1-.98.804H8.82a1 1 0 0 1-.98-.804l-.331-1.652a6.993 6.993 0 0 1-1.929-1.115l-1.598.54a1 1 0 0 1-1.186-.447l-1.18-2.044a1 1 0 0 1 .205-1.251l1.267-1.114a7.05 7.05 0 0 1 0-2.227L1.821 7.773a1 1 0 0 1-.206-1.25l1.18-2.045a1 1 0 0 1 1.187-.447l1.598.54A6.992 6.992 0 0 1 7.51 3.456l.33-1.652ZM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" clip-rule="evenodd" />
    </svg>
  );
}

function SidebarIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
      <path fill-rule="evenodd" d="M2 4.75A.75.75 0 0 1 2.75 4h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 4.75Zm0 10.5a.75.75 0 0 1 .75-.75h7.5a.75.75 0 0 1 0 1.5h-7.5a.75.75 0 0 1-.75-.75ZM2 10a.75.75 0 0 1 .75-.75h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 10Z" clip-rule="evenodd" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
      <path d="M3.75 3A1.75 1.75 0 0 0 2 4.75v3.26a3.235 3.235 0 0 1 1.75-.51h12.5c.644 0 1.245.188 1.75.51V6.75A1.75 1.75 0 0 0 16.25 5h-4.836a.25.25 0 0 1-.177-.073L9.823 3.513A1.75 1.75 0 0 0 8.586 3H3.75ZM3.75 9A1.75 1.75 0 0 0 2 10.75v4.5c0 .966.784 1.75 1.75 1.75h12.5A1.75 1.75 0 0 0 18 15.25v-4.5A1.75 1.75 0 0 0 16.25 9H3.75Z" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
      <path d="M3 3.5A1.5 1.5 0 0 1 4.5 2h6.879a1.5 1.5 0 0 1 1.06.44l4.122 4.12A1.5 1.5 0 0 1 17 7.622V16.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 16.5v-13Z" />
    </svg>
  );
}

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
        icon: <PlusIcon />,
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
        icon: <PauseIcon />,
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
        icon: <PlayIcon />,
        action: () => {
          close();
          resumeAll();
        },
      },
      {
        id: "clear-completed",
        label: "Clear Completed Downloads",
        group: "actions",
        icon: <TrashIcon />,
        action: () => {
          close();
          deleteCompleted();
        },
      },
      {
        id: "open-downloads-folder",
        label: "Open Downloads Folder",
        group: "actions",
        icon: <FolderIcon />,
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
        icon: <CogIcon />,
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
        icon: <SidebarIcon />,
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
      icon: <FileIcon />,
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
          class="w-full max-w-lg bg-surface border border-border rounded-xl shadow-2xl overflow-hidden"
          role="dialog"
          aria-label="Command palette"
        >
          {/* Search input */}
          <div class="flex items-center gap-2 px-4 py-3 border-b border-border">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5 text-text-muted shrink-0">
              <path fill-rule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clip-rule="evenodd" />
            </svg>
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
