import { For, type Component } from "solid-js";
import SettingSection from "../SettingSection";

interface Shortcut {
  label: string;
  keys: string[];
}

const globalShortcuts: Shortcut[] = [
  { label: "Open Settings", keys: ["⌘", ","] },
  { label: "Add URL", keys: ["⌘", "N"] },
  { label: "Search Downloads", keys: ["⌘", "F"] },
  { label: "Toggle Sidebar", keys: ["⌘", "B"] },
  { label: "Select All", keys: ["⌘", "A"] },
];

const downloadShortcuts: Shortcut[] = [
  { label: "Pause / Resume", keys: ["Space"] },
  { label: "Delete", keys: ["⌫"] },
  { label: "Open File", keys: ["Enter"] },
  { label: "Open Folder", keys: ["⌘", "Enter"] },
  { label: "Copy URL", keys: ["⌘", "C"] },
  { label: "Retry", keys: ["⌘", "R"] },
];

const navigationShortcuts: Shortcut[] = [
  { label: "Close Panel / Deselect", keys: ["Esc"] },
  { label: "Move Up", keys: ["↑"] },
  { label: "Move Down", keys: ["↓"] },
  { label: "Extend Selection Up", keys: ["Shift", "↑"] },
  { label: "Extend Selection Down", keys: ["Shift", "↓"] },
];

const ShortcutRow: Component<{ shortcut: Shortcut }> = (props) => {
  return (
    <div class="flex items-center justify-between py-[10px]">
      <span class="text-caption text-secondary">{props.shortcut.label}</span>
      <div class="flex items-center gap-[4px]">
        <For each={props.shortcut.keys}>
          {(key) => (
            <kbd class="inline-flex items-center justify-center min-w-[24px] h-[24px] px-[6px] rounded-[4px] bg-surface border border-border text-mini font-mono font-extrabold text-muted">
              {key}
            </kbd>
          )}
        </For>
      </div>
    </div>
  );
};

const ShortcutsTab: Component = () => {
  return (
    <div class="flex flex-col gap-[24px]">
      <SettingSection title="Global">
        <For each={globalShortcuts}>
          {(shortcut) => <ShortcutRow shortcut={shortcut} />}
        </For>
      </SettingSection>

      <SettingSection title="Download Actions">
        <For each={downloadShortcuts}>
          {(shortcut) => <ShortcutRow shortcut={shortcut} />}
        </For>
      </SettingSection>

      <SettingSection title="Navigation">
        <For each={navigationShortcuts}>
          {(shortcut) => <ShortcutRow shortcut={shortcut} />}
        </For>
      </SettingSection>
    </div>
  );
};

export default ShortcutsTab;
