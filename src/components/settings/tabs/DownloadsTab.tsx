import type { Component } from "solid-js";
import { useSettings } from "../../../stores/settings";
import SettingSection from "../SettingSection";
import SettingRow from "../SettingRow";
import SettingToggle from "../SettingToggle";
import SettingStepper from "../SettingStepper";

const DownloadsTab: Component = () => {
  const { config, update } = useSettings();

  return (
    <div class="flex flex-col gap-[24px]">
      <SettingSection title="Connections">
        <SettingRow label="Default Connections" description="Number of parallel connections per download (1–128)">
          <SettingStepper
            value={config.downloads.default_connections}
            min={1}
            max={128}
            onChange={(v) => update("downloads.default_connections", v)}
          />
        </SettingRow>
        <SettingRow label="Max Concurrent Downloads" description="Maximum downloads running at once (1–20)">
          <SettingStepper
            value={config.downloads.max_concurrent}
            min={1}
            max={20}
            onChange={(v) => update("downloads.max_concurrent", v)}
          />
        </SettingRow>
      </SettingSection>

      <SettingSection title="Bandwidth">
        <SettingRow label="Bandwidth Limit" description="Global speed limit in KB/s (0 = unlimited)">
          <SettingStepper
            value={config.downloads.bandwidth_limit ? config.downloads.bandwidth_limit / 1024 : 0}
            min={0}
            max={102400}
            step={256}
            onChange={(v) => update("downloads.bandwidth_limit", v === 0 ? null : v * 1024)}
          />
        </SettingRow>
      </SettingSection>

      <SettingSection title="Behavior">
        <SettingRow label="Auto Resume" description="Automatically resume incomplete downloads on app start">
          <SettingToggle
            checked={config.downloads.auto_resume}
            onChange={(v) => update("downloads.auto_resume", v)}
          />
        </SettingRow>
      </SettingSection>
    </div>
  );
};

export default DownloadsTab;
