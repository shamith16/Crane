import { createSignal, Switch, Match, type Component } from "solid-js";
import { ArrowLeft } from "lucide-solid";
import { useLayout } from "../layout/LayoutContext";
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

const SettingsPage: Component = () => {
  const { setCurrentPage } = useLayout();
  const [activeTab, setActiveTab] = createSignal<SettingsTab>("general");

  return (
    <div class="flex flex-col flex-1 min-h-0">
      {/* Header */}
      <div class="flex items-center gap-[12px] px-[24px] py-[16px] border-b border-border shrink-0">
        <button
          class="flex items-center justify-center w-[32px] h-[32px] rounded-md text-muted hover:text-primary hover:bg-hover transition-colors cursor-pointer"
          onClick={() => setCurrentPage("downloads")}
        >
          <ArrowLeft size={18} />
        </button>
        <h1 class="text-title font-semibold text-primary">Settings</h1>
        <div class="flex-1" />
        <kbd class="inline-flex items-center gap-[4px] text-mini font-mono text-muted">
          <span class="px-[4px] py-[1px] rounded bg-surface border border-border">⌘</span>
          <span class="px-[4px] py-[1px] rounded bg-surface border border-border">,</span>
        </kbd>
      </div>

      {/* Body: nav + content */}
      <div class="flex flex-1 min-h-0">
        {/* Left nav */}
        <SettingsNav active={activeTab()} onSelect={setActiveTab} />

        {/* Right content */}
        <div class="flex-1 min-w-0 overflow-y-auto p-[32px_40px]">
          <h2 class="text-heading font-semibold text-primary mb-[20px]">
            {tabTitles[activeTab()]}
          </h2>

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
