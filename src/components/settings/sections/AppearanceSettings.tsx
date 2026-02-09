import { applyTheme } from "../../../lib/theme";
import type { AppConfig, AppearanceConfig } from "../../../lib/types";

interface Props {
  config: AppConfig;
  onSave: (config: AppConfig) => void;
}

export default function AppearanceSettings(props: Props) {
  function update(patch: Partial<AppearanceConfig>) {
    const updated = {
      ...props.config,
      appearance: { ...props.config.appearance, ...patch },
    };
    props.onSave(updated);

    // Apply theme immediately if changed
    if (patch.theme) {
      applyTheme(patch.theme);
    }
  }

  return (
    <div class="max-w-2xl space-y-6">
      <h2 class="text-base font-semibold text-text-primary">Appearance</h2>

      {/* Theme */}
      <div class="space-y-1.5">
        <label class="text-sm font-medium text-text-secondary">Theme</label>
        <select
          class="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-active"
          value={props.config.appearance.theme}
          onChange={(e) =>
            update({
              theme: e.currentTarget.value as "system" | "light" | "dark",
            })
          }
        >
          <option value="system">System</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </div>

      {/* Accent Color */}
      <div class="space-y-1.5">
        <label class="text-sm font-medium text-text-secondary">
          Accent Color
        </label>
        <div class="flex items-center gap-3">
          <input
            type="text"
            class="flex-1 bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted outline-none focus:border-active font-mono"
            placeholder="#3B82F6"
            value={props.config.appearance.accent_color}
            onInput={(e) => update({ accent_color: e.currentTarget.value })}
          />
          <div
            class="w-10 h-10 rounded-lg border border-border shrink-0"
            style={{ "background-color": props.config.appearance.accent_color }}
          />
        </div>
        <div class="text-xs text-text-muted">
          Enter a hex color value (e.g., #3B82F6)
        </div>
      </div>

      {/* Font Size */}
      <div class="space-y-1.5">
        <label class="text-sm font-medium text-text-secondary">
          Font Size
        </label>
        <select
          class="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-active"
          value={props.config.appearance.font_size}
          onChange={(e) =>
            update({
              font_size: e.currentTarget.value as "small" | "default" | "large",
            })
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
        class={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform shadow-sm ${
          props.value ? "translate-x-5" : "translate-x-1"
        }`}
      />
    </button>
  );
}
