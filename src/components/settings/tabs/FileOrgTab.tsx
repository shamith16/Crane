import type { Component } from "solid-js";
import { useSettings } from "../../../stores/settings";
import SettingSection from "../SettingSection";
import SettingRow from "../SettingRow";
import SettingToggle from "../SettingToggle";
import SettingSelect from "../SettingSelect";

const FileOrgTab: Component = () => {
  const { config, update } = useSettings();

  return (
    <div class="flex flex-col gap-[24px]">
      <SettingSection title="Organization">
        <SettingRow label="Auto Categorize" description="Automatically sort files into category folders">
          <SettingToggle
            checked={config.file_organization.auto_categorize}
            onChange={(v) => update("file_organization.auto_categorize", v)}
          />
        </SettingRow>
        <SettingRow label="Date Subfolders" description="Create subfolders by download date (YYYY-MM-DD)">
          <SettingToggle
            checked={config.file_organization.date_subfolders}
            onChange={(v) => update("file_organization.date_subfolders", v)}
          />
        </SettingRow>
      </SettingSection>

      <SettingSection title="Duplicates">
        <SettingRow label="Duplicate Handling" description="What to do when a file already exists">
          <SettingSelect
            value={config.file_organization.duplicate_handling}
            options={[
              { value: "ask", label: "Ask Me" },
              { value: "rename", label: "Auto Rename" },
              { value: "overwrite", label: "Overwrite" },
              { value: "skip", label: "Skip" },
            ]}
            onChange={(v) => update("file_organization.duplicate_handling", v)}
          />
        </SettingRow>
      </SettingSection>
    </div>
  );
};

export default FileOrgTab;
