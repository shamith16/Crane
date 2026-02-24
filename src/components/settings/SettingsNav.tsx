import { For, type Component } from "solid-js";
import {
  Settings,
  Download,
  Folder,
  Globe,
  Wifi,
  Wrench,
  Keyboard,
  Palette,
} from "lucide-solid";

export type SettingsTab =
  | "general"
  | "downloads"
  | "file-org"
  | "browser"
  | "network"
  | "advanced"
  | "shortcuts"
  | "appearance";

const navItems: { id: SettingsTab; label: string; icon: typeof Settings }[] = [
  { id: "general", label: "General", icon: Settings },
  { id: "downloads", label: "Downloads", icon: Download },
  { id: "file-org", label: "File Organization", icon: Folder },
  { id: "browser", label: "Browser Integration", icon: Globe },
  { id: "network", label: "Network", icon: Wifi },
  { id: "advanced", label: "Advanced", icon: Wrench },
  { id: "shortcuts", label: "Keyboard Shortcuts", icon: Keyboard },
  { id: "appearance", label: "Appearance", icon: Palette },
];

interface SettingsNavProps {
  active: SettingsTab;
  onSelect: (tab: SettingsTab) => void;
}

const SettingsNav: Component<SettingsNavProps> = (props) => {
  return (
    <nav class="flex flex-col gap-[2px] w-[240px] shrink-0 bg-inset py-[16px] h-full">
      <For each={navItems}>
        {(item) => {
          const isActive = () => props.active === item.id;
          return (
            <button
              class={`flex items-center gap-[12px] px-[20px] h-[40px] text-[14px] transition-colors cursor-pointer ${
                isActive()
                  ? "bg-surface text-white font-medium border-l-[3px] border-accent pl-[17px]"
                  : "text-secondary hover:text-primary hover:bg-surface/50"
              }`}
              onClick={() => props.onSelect(item.id)}
            >
              <item.icon size={18} class={isActive() ? "text-accent" : "text-muted"} />
              <span>{item.label}</span>
            </button>
          );
        }}
      </For>
    </nav>
  );
};

export default SettingsNav;
