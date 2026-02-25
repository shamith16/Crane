import { For, type Component } from "solid-js";
import { useSettings } from "../../../stores/settings";
import SettingSection from "../SettingSection";
import SettingRow from "../SettingRow";
import SettingButtonGroup from "../SettingButtonGroup";

const ACCENT_PRESETS = [
  "#22D3EE", // cyan (default)
  "#3B82F6", // blue
  "#8B5CF6", // violet
  "#EC4899", // pink
  "#F97316", // orange
  "#10B981", // emerald
  "#F59E0B", // amber
  "#EF4444", // red
];

const AppearanceTab: Component = () => {
  const { config, update } = useSettings();

  return (
    <div class="flex flex-col gap-[24px]">
      <SettingSection title="Theme">
        <SettingRow label="Color Scheme" description="Choose your preferred theme">
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
          <div class="flex items-center gap-[6px]">
            <For each={ACCENT_PRESETS}>
              {(color) => (
                <button
                  class={`w-[22px] h-[22px] rounded-full cursor-pointer transition-transform hover:scale-110 ${
                    config.appearance.accent_color.toUpperCase() === color.toUpperCase()
                      ? "ring-2 ring-offset-2 ring-offset-page ring-primary scale-110"
                      : ""
                  }`}
                  style={{ "background-color": color }}
                  onClick={() => update("appearance.accent_color", color)}
                />
              )}
            </For>
            <label class="relative w-[22px] h-[22px] rounded-full cursor-pointer border-2 border-dashed border-muted hover:border-secondary transition-colors overflow-hidden">
              <input
                type="color"
                value={config.appearance.accent_color}
                onInput={(e) => update("appearance.accent_color", e.currentTarget.value)}
                class="absolute inset-0 opacity-0 cursor-pointer"
              />
            </label>
          </div>
        </SettingRow>
      </SettingSection>
    </div>
  );
};

export default AppearanceTab;
