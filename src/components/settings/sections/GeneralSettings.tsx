import type { AppConfig } from "../../../lib/types";

interface Props {
  config: AppConfig;
  onSave: (config: AppConfig) => void;
}

export default function GeneralSettings(props: Props) {
  function update(patch: Partial<AppConfig["general"]>) {
    props.onSave({
      ...props.config,
      general: { ...props.config.general, ...patch },
    });
  }

  return (
    <div class="max-w-2xl space-y-6">
      <h2 class="text-base font-semibold text-text-primary">General</h2>

      {/* Download Location */}
      <div class="space-y-1.5">
        <label class="text-sm font-medium text-text-secondary">
          Download Location
        </label>
        <div class="flex gap-2">
          <input
            type="text"
            class="flex-1 bg-surface border border-border rounded-full px-3 py-2 text-sm text-text-primary placeholder-text-muted outline-none focus:border-active"
            value={props.config.general.download_location}
            onInput={(e) =>
              update({ download_location: e.currentTarget.value })
            }
          />
          <button
            class="px-3 py-2 bg-surface border border-border rounded-full text-sm text-text-muted cursor-not-allowed"
            disabled
            title="Coming soon"
          >
            Browse
          </button>
        </div>
      </div>

      {/* Launch at Startup */}
      <div class="flex items-center justify-between">
        <div>
          <div class="text-sm font-medium text-text-primary">
            Launch at Startup
          </div>
          <div class="text-xs text-text-muted">
            Automatically start Crane when you log in
          </div>
        </div>
        <Toggle
          value={props.config.general.launch_at_startup}
          onChange={(v) => update({ launch_at_startup: v })}
        />
      </div>

      {/* Minimize to Tray */}
      <div class="flex items-center justify-between">
        <div>
          <div class="text-sm font-medium text-text-primary">
            Minimize to Tray
          </div>
          <div class="text-xs text-text-muted">
            Keep Crane running in the system tray when closed
          </div>
        </div>
        <Toggle
          value={props.config.general.minimize_to_tray}
          onChange={(v) => update({ minimize_to_tray: v })}
        />
      </div>

      {/* Notification Level */}
      <div class="space-y-1.5">
        <label class="text-sm font-medium text-text-secondary">
          Notification Level
        </label>
        <select
          class="w-full bg-surface border border-border rounded-full px-3 py-2 text-sm text-text-primary outline-none focus:border-active"
          value={props.config.general.notification_level}
          onChange={(e) =>
            update({
              notification_level: e.currentTarget.value as
                | "all"
                | "failed_only"
                | "never",
            })
          }
        >
          <option value="all">All</option>
          <option value="failed_only">Failed Only</option>
          <option value="never">Never</option>
        </select>
      </div>

      {/* Language */}
      <div class="space-y-1.5">
        <label class="text-sm font-medium text-text-secondary">Language</label>
        <select
          class="w-full bg-surface border border-border rounded-full px-3 py-2 text-sm text-text-primary outline-none focus:border-active"
          value={props.config.general.language}
          onChange={(e) => update({ language: e.currentTarget.value })}
        >
          <option value="en">English</option>
          <option value="es">Spanish</option>
          <option value="fr">French</option>
          <option value="de">German</option>
          <option value="ja">Japanese</option>
          <option value="zh">Chinese</option>
        </select>
      </div>

      {/* Auto-Update */}
      <div class="flex items-center justify-between">
        <div>
          <div class="text-sm font-medium text-text-primary">Auto-Update</div>
          <div class="text-xs text-text-muted">
            Automatically check for and install updates
          </div>
        </div>
        <Toggle
          value={props.config.general.auto_update}
          onChange={(v) => update({ auto_update: v })}
        />
      </div>
    </div>
  );
}

// ─── Toggle Component ─────────────────────────────

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
