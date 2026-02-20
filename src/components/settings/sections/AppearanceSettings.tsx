import { For } from "solid-js";
import { applyAppearance } from "../../../lib/theme";
import type { AppConfig, AppearanceConfig } from "../../../lib/types";

interface Props {
  config: AppConfig;
  onSave: (config: AppConfig) => void;
}

const ACCENT_PRESETS = [
  { color: "#19e66b", label: "Green" },
  { color: "#3B82F6", label: "Blue" },
  { color: "#8B5CF6", label: "Purple" },
  { color: "#F59E0B", label: "Amber" },
  { color: "#EF4444", label: "Red" },
  { color: "#EC4899", label: "Pink" },
  { color: "#06B6D4", label: "Cyan" },
  { color: "#F97316", label: "Orange" },
];

const DENSITY_OPTIONS: { key: AppearanceConfig["list_density"]; label: string; description: string }[] = [
  { key: "compact", label: "Compact", description: "Minimal spacing, more items visible" },
  { key: "comfortable", label: "Comfortable", description: "Balanced spacing and readability" },
  { key: "cozy", label: "Cozy", description: "Extra spacing, relaxed feel" },
];

export default function AppearanceSettings(props: Props) {
  function update(patch: Partial<AppearanceConfig>) {
    const updated = {
      ...props.config,
      appearance: { ...props.config.appearance, ...patch },
    };
    props.onSave(updated);
    applyAppearance(updated.appearance);
  }

  return (
    <div class="max-w-2xl space-y-8">
      <h2 class="text-base font-semibold text-text-primary">Appearance</h2>

      {/* Theme */}
      <div class="space-y-1.5">
        <label class="text-sm font-medium text-text-secondary">Theme</label>
        <select
          class="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-active"
          value={props.config.appearance.theme}
          onChange={(e) =>
            update({ theme: e.currentTarget.value as AppearanceConfig["theme"] })
          }
        >
          <option value="system">System</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </div>

      {/* Accent Color */}
      <div class="space-y-3">
        <label class="text-sm font-medium text-text-secondary">Accent Color</label>
        <div class="flex items-center gap-2.5">
          <For each={ACCENT_PRESETS}>
            {(preset) => (
              <button
                class={`w-8 h-8 rounded-full transition-all ${
                  props.config.appearance.accent_color.toLowerCase() === preset.color.toLowerCase()
                    ? "ring-2 ring-offset-2 ring-offset-bg ring-text-primary scale-110"
                    : "hover:scale-110"
                }`}
                style={{ "background-color": preset.color }}
                onClick={() => update({ accent_color: preset.color })}
                title={preset.label}
              />
            )}
          </For>
        </div>
        <div class="flex items-center gap-3 mt-2">
          <input
            type="text"
            class="flex-1 bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted outline-none focus:border-active font-mono"
            placeholder="#19e66b"
            value={props.config.appearance.accent_color}
            onInput={(e) => update({ accent_color: e.currentTarget.value })}
          />
          <div
            class="w-10 h-10 rounded-lg border border-border shrink-0"
            style={{ "background-color": props.config.appearance.accent_color }}
          />
        </div>
        <p class="text-xs text-text-muted">Pick a preset or enter a custom hex value</p>
      </div>

      {/* List Density */}
      <div class="space-y-3">
        <label class="text-sm font-medium text-text-secondary">List Density</label>
        <div class="grid grid-cols-3 gap-3">
          <For each={DENSITY_OPTIONS}>
            {(opt) => {
              const active = () => props.config.appearance.list_density === opt.key;
              return (
                <button
                  class={`flex flex-col items-center gap-2 p-4 rounded-lg border text-center transition-colors ${
                    active()
                      ? "border-active bg-active/5 text-active"
                      : "border-border bg-surface hover:bg-surface-hover text-text-secondary hover:text-text-primary"
                  }`}
                  onClick={() => update({ list_density: opt.key })}
                >
                  {/* Visual density preview */}
                  <div class="w-full flex flex-col items-stretch">
                    {[...Array(3)].map((_, i) => (
                      <div
                        class={`rounded-sm ${active() ? "bg-active/30" : "bg-border"}`}
                        style={{
                          height: opt.key === "compact" ? "3px" : opt.key === "comfortable" ? "4px" : "5px",
                          "margin-bottom": i < 2
                            ? opt.key === "compact" ? "2px" : opt.key === "comfortable" ? "4px" : "6px"
                            : "0",
                        }}
                      />
                    ))}
                  </div>
                  <span class="text-xs font-medium">{opt.label}</span>
                </button>
              );
            }}
          </For>
        </div>
        <p class="text-xs text-text-muted">
          {DENSITY_OPTIONS.find((o) => o.key === props.config.appearance.list_density)?.description}
        </p>
      </div>

      {/* Window Opacity */}
      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <label class="text-sm font-medium text-text-secondary">Window Opacity</label>
          <span class="text-xs text-text-muted tabular-nums font-mono">
            {Math.round(props.config.appearance.window_opacity * 100)}%
          </span>
        </div>
        <input
          type="range"
          min="50"
          max="100"
          value={Math.round(props.config.appearance.window_opacity * 100)}
          onInput={(e) => update({ window_opacity: parseInt(e.currentTarget.value, 10) / 100 })}
          class="w-full accent-active"
        />
        <div class="flex justify-between text-[11px] text-text-muted">
          <span>50%</span>
          <span>100%</span>
        </div>
      </div>

      {/* Font Size */}
      <div class="space-y-1.5">
        <label class="text-sm font-medium text-text-secondary">Font Size</label>
        <select
          class="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-active"
          value={props.config.appearance.font_size}
          onChange={(e) =>
            update({ font_size: e.currentTarget.value as AppearanceConfig["font_size"] })
          }
        >
          <option value="small">Small</option>
          <option value="default">Default</option>
          <option value="large">Large</option>
        </select>
      </div>

      {/* Compact Mode */}
      <div class="flex items-center justify-between">
        <div>
          <div class="text-sm font-medium text-text-primary">Compact Mode</div>
          <div class="text-xs text-text-muted">
            Reduce padding and spacing for a denser layout
          </div>
        </div>
        <Toggle
          value={props.config.appearance.compact_mode}
          onChange={(v) => update({ compact_mode: v })}
        />
      </div>
    </div>
  );
}

function Toggle(props: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      class={`relative w-10 h-6 rounded-full transition-colors shrink-0 ${
        props.value ? "bg-active" : "bg-surface border border-border"
      }`}
      onClick={() => props.onChange(!props.value)}
      role="switch"
      aria-checked={props.value}
    >
      <span
        class={`absolute left-0 top-1 w-4 h-4 rounded-full bg-white transition-transform shadow-sm ${
          props.value ? "translate-x-5" : "translate-x-1"
        }`}
      />
    </button>
  );
}
