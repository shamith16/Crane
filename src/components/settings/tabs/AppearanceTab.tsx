import type { Component } from "solid-js";
import { useSettings } from "../../../stores/settings";
import SettingSection from "../SettingSection";
import SettingRow from "../SettingRow";
import SettingToggle from "../SettingToggle";
import SettingSelect from "../SettingSelect";
import SettingButtonGroup from "../SettingButtonGroup";

const AppearanceTab: Component = () => {
  const { config, update } = useSettings();

  return (
    <div class="flex flex-col gap-[24px]">
      <SettingSection title="Theme">
        <SettingRow label="Theme" description="Choose your preferred color scheme">
          <SettingButtonGroup
            value={config.appearance.theme}
            options={[
              { value: "system", label: "System" },
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ]}
            onChange={(v) => update("appearance.theme", v)}
          />
        </SettingRow>
        <SettingRow label="Accent Color">
          <input
            type="color"
            value={config.appearance.accent_color}
            onInput={(e) => update("appearance.accent_color", e.currentTarget.value)}
            class="w-[32px] h-[32px] rounded-md border border-border cursor-pointer bg-transparent"
          />
        </SettingRow>
      </SettingSection>

      <SettingSection title="Typography">
        <SettingRow label="Font Size">
          <SettingButtonGroup
            value={config.appearance.font_size}
            options={[
              { value: "small", label: "Small" },
              { value: "default", label: "Default" },
              { value: "large", label: "Large" },
            ]}
            onChange={(v) => update("appearance.font_size", v)}
          />
        </SettingRow>
      </SettingSection>

      <SettingSection title="Layout">
        <SettingRow label="Compact Mode" description="Reduce padding and spacing throughout the app">
          <SettingToggle
            checked={config.appearance.compact_mode}
            onChange={(v) => update("appearance.compact_mode", v)}
          />
        </SettingRow>
        <SettingRow label="List Density" description="Spacing between download items">
          <SettingButtonGroup
            value={config.appearance.list_density}
            options={[
              { value: "compact", label: "Compact" },
              { value: "comfortable", label: "Comfortable" },
              { value: "cozy", label: "Cozy" },
            ]}
            onChange={(v) => update("appearance.list_density", v)}
          />
        </SettingRow>
      </SettingSection>

      <SettingSection title="Window">
        <SettingRow label="Window Opacity" description="Adjust window transparency (10%–100%)">
          <div class="flex items-center gap-[12px]">
            <input
              type="range"
              min="10"
              max="100"
              value={Math.round(config.appearance.window_opacity * 100)}
              onInput={(e) => update("appearance.window_opacity", parseInt(e.currentTarget.value) / 100)}
              class="w-[120px] accent-accent"
            />
            <span class="text-caption font-mono text-muted w-[36px] text-right">
              {Math.round(config.appearance.window_opacity * 100)}%
            </span>
          </div>
        </SettingRow>
      </SettingSection>
    </div>
  );
};

export default AppearanceTab;
