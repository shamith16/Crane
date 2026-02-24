import { createSignal, type Component } from "solid-js";
import { FileText, FolderOpen, Download, Upload, RotateCcw } from "lucide-solid";
import {
  isTauri,
  getConfigPath,
  openConfigFile,
  resetSettings,
} from "../../../lib/tauri";
import { useSettings } from "../../../stores/settings";
import SettingSection from "../SettingSection";
import SettingRow from "../SettingRow";

const AdvancedTab: Component = () => {
  const { reload } = useSettings();
  const [configPath, setConfigPath] = createSignal<string | null>(null);

  const loadConfigPath = async () => {
    if (!isTauri()) {
      setConfigPath("~/Library/Application Support/crane/config.toml");
      return;
    }
    try {
      setConfigPath(await getConfigPath());
    } catch (e) {
      console.error("[crane] failed to get config path:", e);
    }
  };

  loadConfigPath();

  const handleOpenConfig = async () => {
    if (!isTauri()) return;
    try {
      await openConfigFile();
    } catch (e) {
      console.error("[crane] failed to open config:", e);
    }
  };

  const handleReset = async () => {
    if (!isTauri()) return;
    try {
      await resetSettings();
      await reload();
    } catch (e) {
      console.error("[crane] failed to reset settings:", e);
    }
  };

  return (
    <div class="flex flex-col gap-[24px]">
      <SettingSection title="Configuration File">
        <SettingRow label="Config Location" description={configPath() ?? "Loading..."}>
          <button
            class="flex items-center gap-[6px] bg-surface border border-border rounded-md px-[12px] py-[6px] text-caption font-mono text-secondary hover:border-accent/50 transition-colors cursor-pointer"
            onClick={handleOpenConfig}
          >
            <FileText size={14} />
            <span>Open in Editor</span>
          </button>
        </SettingRow>
      </SettingSection>

      <SettingSection title="Data Management">
        <div class="flex flex-wrap gap-[8px] py-[12px]">
          <button
            class="flex items-center gap-[6px] bg-surface border border-border rounded-md px-[12px] py-[8px] text-caption font-mono text-secondary hover:border-accent/50 transition-colors cursor-pointer"
          >
            <Download size={14} />
            <span>Export Settings</span>
          </button>
          <button
            class="flex items-center gap-[6px] bg-surface border border-border rounded-md px-[12px] py-[8px] text-caption font-mono text-secondary hover:border-accent/50 transition-colors cursor-pointer"
          >
            <Upload size={14} />
            <span>Import Settings</span>
          </button>
          <button
            class="flex items-center gap-[6px] bg-surface border border-error rounded-md px-[12px] py-[8px] text-caption font-mono text-error hover:bg-error/10 transition-colors cursor-pointer"
            onClick={handleReset}
          >
            <RotateCcw size={14} />
            <span>Reset to Defaults</span>
          </button>
        </div>
      </SettingSection>
    </div>
  );
};

export default AdvancedTab;
