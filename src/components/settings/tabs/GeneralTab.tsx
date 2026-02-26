import type { Component } from "solid-js";
import { FolderOpen } from "lucide-solid";
import { open } from "@tauri-apps/plugin-dialog";
import { isTauri } from "../../../lib/tauri";
import { useSettings } from "../../../stores/settings";
import SettingSection from "../SettingSection";
import SettingRow from "../SettingRow";
import SettingToggle from "../SettingToggle";
import SettingSelect from "../SettingSelect";

const GeneralTab: Component = () => {
  const { config, update } = useSettings();

  const handlePickFolder = async () => {
    if (!isTauri()) return;
    const selected = await open({
      directory: true,
      defaultPath: config.general.download_location || undefined,
      title: "Choose Download Location",
    });
    if (selected) {
      update("general.download_location", selected);
    }
  };

  return (
    <div class="flex flex-col gap-[24px]">
      <SettingSection title="Storage">
        <SettingRow label="Download Location" description="Default folder for saved files">
          <button
            class="flex items-center gap-[8px] bg-surface border border-border rounded-md px-[12px] py-[6px] text-caption font-mono text-secondary hover:border-accent/50 transition-colors cursor-pointer max-w-[280px]"
            onClick={handlePickFolder}
          >
            <span class="truncate">{config.general.download_location}</span>
            <FolderOpen size={14} class="text-muted shrink-0" />
          </button>
        </SettingRow>
      </SettingSection>

      <SettingSection title="Startup">
        <SettingRow label="Launch at Startup" description="Start Crane when you log in">
          <SettingToggle
            checked={config.general.launch_at_startup}
            onChange={(v) => update("general.launch_at_startup", v)}
          />
        </SettingRow>
        <SettingRow label="Minimize to Tray" description="Keep running in system tray when closed">
          <SettingToggle
            checked={config.general.minimize_to_tray}
            onChange={(v) => update("general.minimize_to_tray", v)}
          />
        </SettingRow>
      </SettingSection>

      <SettingSection title="Notifications">
        <SettingRow label="Notification Level" description="When to show desktop notifications">
          <SettingSelect
            value={config.general.notification_level}
            options={[
              { value: "all", label: "All Events" },
              { value: "failedonly", label: "Failed Only" },
              { value: "never", label: "Never" },
            ]}
            onChange={(v) => update("general.notification_level", v)}
          />
        </SettingRow>
      </SettingSection>

      <SettingSection title="Updates">
        <SettingRow label="Auto Update" description="Automatically check for and install updates">
          <SettingToggle
            checked={config.general.auto_update}
            onChange={(v) => update("general.auto_update", v)}
          />
        </SettingRow>
      </SettingSection>

      <SettingSection title="Language">
        <SettingRow label="Language">
          <SettingSelect
            value={config.general.language}
            options={[
              { value: "en", label: "English" },
              { value: "es", label: "Español" },
              { value: "fr", label: "Français" },
              { value: "de", label: "Deutsch" },
              { value: "ja", label: "日本語" },
              { value: "zh", label: "中文" },
            ]}
            onChange={(v) => update("general.language", v)}
          />
        </SettingRow>
      </SettingSection>
    </div>
  );
};

export default GeneralTab;
