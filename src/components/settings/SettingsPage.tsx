import { createSignal, Switch, Match, onMount, onCleanup, type Component } from "solid-js";
import { X } from "lucide-solid";
import SettingsNav, { type SettingsTab } from "./SettingsNav";
import GeneralTab from "./tabs/GeneralTab";
import DownloadsTab from "./tabs/DownloadsTab";
import FileOrgTab from "./tabs/FileOrgTab";
import BrowserTab from "./tabs/BrowserTab";
import NetworkTab from "./tabs/NetworkTab";
import AdvancedTab from "./tabs/AdvancedTab";
import ShortcutsTab from "./tabs/ShortcutsTab";
import AppearanceTab from "./tabs/AppearanceTab";

const tabTitles: Record<SettingsTab, string> = {
  general: "General",
  downloads: "Downloads",
  "file-org": "File Organization",
  browser: "Browser Integration",
  network: "Network",
  advanced: "Advanced",
  shortcuts: "Keyboard Shortcuts",
  appearance: "Appearance",
};

interface SettingsPageProps {
  onClose: () => void;
}

const SettingsPage: Component<SettingsPageProps> = (props) => {
  const [activeTab, setActiveTab] = createSignal<SettingsTab>("general");

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") props.onClose();
  };

  onMount(() => document.addEventListener("keydown", handleKeyDown));
  onCleanup(() => document.removeEventListener("keydown", handleKeyDown));

  const handleBackdropClick = (e: MouseEvent) => {
    if (e.target === e.currentTarget) props.onClose();
  };

  return (
    <div
      class="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-[12px] bg-page/70"
      onClick={handleBackdropClick}
    >
      <div class="flex w-[80%] h-[80%] max-w-[960px] max-h-[640px] rounded-2xl bg-surface shadow-[0_8px_40px_#00000066] overflow-hidden">
        {/* Left nav */}
        <SettingsNav active={activeTab()} onSelect={setActiveTab} />

        {/* Right content */}
        <div class="flex-1 min-w-0 overflow-y-auto p-[28px_32px]">
          {/* Header */}
          <div class="flex items-center justify-between mb-[24px]">
            <h2 class="text-title font-semibold text-primary">
              {tabTitles[activeTab()]}
            </h2>
            <button
              class="flex items-center justify-center w-[32px] h-[32px] rounded-full text-muted hover:text-primary hover:bg-hover transition-colors cursor-pointer"
              onClick={props.onClose}
            >
              <X size={18} />
            </button>
          </div>

          <Switch>
            <Match when={activeTab() === "general"}><GeneralTab /></Match>
            <Match when={activeTab() === "downloads"}><DownloadsTab /></Match>
            <Match when={activeTab() === "file-org"}><FileOrgTab /></Match>
            <Match when={activeTab() === "browser"}><BrowserTab /></Match>
            <Match when={activeTab() === "network"}><NetworkTab /></Match>
            <Match when={activeTab() === "advanced"}><AdvancedTab /></Match>
            <Match when={activeTab() === "shortcuts"}><ShortcutsTab /></Match>
            <Match when={activeTab() === "appearance"}><AppearanceTab /></Match>
          </Switch>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
