import type { AppConfig } from "../../../lib/types";

interface Props {
  config: AppConfig;
  onSave: (config: AppConfig) => void;
}

export default function DownloadsSettings(props: Props) {
  function update(patch: Partial<AppConfig["downloads"]>) {
    props.onSave({
      ...props.config,
      downloads: { ...props.config.downloads, ...patch },
    });
  }

  return (
    <div class="max-w-2xl space-y-6">
      <h2 class="text-base font-semibold text-text-primary">Downloads</h2>

      {/* Default Connections */}
      <div class="space-y-1.5">
        <div class="flex items-center justify-between">
          <label class="text-sm font-medium text-text-secondary">
            Default Connections per Download
          </label>
          <span class="text-sm font-mono text-text-primary tabular-nums">
            {props.config.downloads.default_connections}
          </span>
        </div>
        <input
          type="range"
          min="1"
          max="32"
          step="1"
          class="w-full accent-active"
          value={props.config.downloads.default_connections}
          onInput={(e) =>
            update({ default_connections: parseInt(e.currentTarget.value) })
          }
        />
        <div class="flex justify-between text-xs text-text-muted">
          <span>1</span>
          <span>32</span>
        </div>
      </div>

      {/* Max Concurrent Downloads */}
      <div class="space-y-1.5">
        <div class="flex items-center justify-between">
          <label class="text-sm font-medium text-text-secondary">
            Max Concurrent Downloads
          </label>
          <span class="text-sm font-mono text-text-primary tabular-nums">
            {props.config.downloads.max_concurrent}
          </span>
        </div>
        <input
          type="range"
          min="1"
          max="10"
          step="1"
          class="w-full accent-active"
          value={props.config.downloads.max_concurrent}
          onInput={(e) =>
            update({ max_concurrent: parseInt(e.currentTarget.value) })
          }
        />
        <div class="flex justify-between text-xs text-text-muted">
          <span>1</span>
          <span>10</span>
        </div>
      </div>

      {/* Bandwidth Limit */}
      <div class="space-y-1.5">
        <label class="text-sm font-medium text-text-secondary">
          Bandwidth Limit (KB/s)
        </label>
        <input
          type="number"
          min="0"
          class="w-full bg-surface border border-border rounded-full px-3 py-2 text-sm text-text-primary placeholder-text-muted outline-none focus:border-active tabular-nums"
          placeholder="0 = Unlimited"
          value={props.config.downloads.bandwidth_limit ?? 0}
          onInput={(e) => {
            const val = parseInt(e.currentTarget.value);
            update({ bandwidth_limit: val > 0 ? val : null });
          }}
        />
        <div class="text-xs text-text-muted">
          Set to 0 for unlimited bandwidth
        </div>
      </div>

      {/* Auto-Resume */}
      <div class="flex items-center justify-between">
        <div>
          <div class="text-sm font-medium text-text-primary">Auto-Resume</div>
          <div class="text-xs text-text-muted">
            Automatically resume interrupted downloads on startup
          </div>
        </div>
        <Toggle
          value={props.config.downloads.auto_resume}
          onChange={(v) => update({ auto_resume: v })}
        />
      </div>

      {/* Large File Threshold */}
      <div class="space-y-1.5">
        <label class="text-sm font-medium text-text-secondary">
          Large File Threshold (MB)
        </label>
        <input
          type="number"
          min="0"
          class="w-full bg-surface border border-border rounded-full px-3 py-2 text-sm text-text-primary placeholder-text-muted outline-none focus:border-active tabular-nums"
          placeholder="No threshold"
          value={
            props.config.downloads.large_file_threshold != null
              ? Math.round(props.config.downloads.large_file_threshold / (1024 * 1024))
              : ""
          }
          onInput={(e) => {
            const val = parseInt(e.currentTarget.value);
            update({
              large_file_threshold:
                !isNaN(val) && val > 0 ? val * 1024 * 1024 : null,
            });
          }}
        />
        <div class="text-xs text-text-muted">
          Files larger than this will prompt for confirmation
        </div>
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
