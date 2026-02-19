import { createSignal, onMount } from "solid-js";
import {
  getConfigPath,
  openConfigFile,
  exportSettings,
  importSettings,
  resetSettings,
} from "../../../lib/commands";

export default function AdvancedSettings() {
  const [configPath, setConfigPath] = createSignal("");
  const [confirmReset, setConfirmReset] = createSignal(false);
  const [exportPath, setExportPath] = createSignal("");
  const [importPath, setImportPath] = createSignal("");
  const [statusMsg, setStatusMsg] = createSignal<string | null>(null);

  onMount(async () => {
    try {
      const path = await getConfigPath();
      setConfigPath(path);
    } catch {
      setConfigPath("Unknown");
    }
  });

  function showStatus(msg: string) {
    setStatusMsg(msg);
    setTimeout(() => setStatusMsg(null), 3000);
  }

  async function handleOpenConfig() {
    try {
      await openConfigFile();
    } catch (e) {
      showStatus("Failed to open config file");
    }
  }

  async function handleExport() {
    const path = exportPath();
    if (!path.trim()) {
      showStatus("Please enter an export path");
      return;
    }
    try {
      await exportSettings(path);
      showStatus("Settings exported successfully");
    } catch {
      showStatus("Failed to export settings");
    }
  }

  async function handleImport() {
    const path = importPath();
    if (!path.trim()) {
      showStatus("Please enter an import path");
      return;
    }
    try {
      await importSettings(path);
      showStatus("Settings imported successfully. Restart may be required.");
    } catch {
      showStatus("Failed to import settings");
    }
  }

  async function handleReset() {
    if (!confirmReset()) {
      setConfirmReset(true);
      return;
    }
    try {
      await resetSettings();
      showStatus("Settings reset to defaults. Restart may be required.");
      setConfirmReset(false);
    } catch {
      showStatus("Failed to reset settings");
    }
  }

  return (
    <div class="max-w-2xl space-y-6">
      <h2 class="text-base font-semibold text-text-primary">Advanced</h2>

      {/* Status Message */}
      {statusMsg() && (
        <div class="bg-active/10 text-active px-4 py-2 rounded-full text-sm">
          {statusMsg()}
        </div>
      )}

      {/* Config File Path */}
      <div class="space-y-1.5">
        <label class="text-sm font-medium text-text-secondary">
          Config File Location
        </label>
        <div class="flex gap-2">
          <div class="flex-1 bg-surface border border-border rounded-full px-3 py-2 text-sm text-text-muted font-mono truncate">
            {configPath()}
          </div>
          <button
            class="px-3 py-2 bg-surface border border-border rounded-full text-sm text-text-primary hover:bg-surface-hover transition-colors shrink-0"
            onClick={handleOpenConfig}
          >
            Open Config File
          </button>
        </div>
      </div>

      {/* Export Settings */}
      <div class="space-y-1.5">
        <label class="text-sm font-medium text-text-secondary">
          Export Settings
        </label>
        <div class="flex gap-2">
          <input
            type="text"
            class="flex-1 bg-surface border border-border rounded-full px-3 py-2 text-sm text-text-primary placeholder-text-muted outline-none focus:border-active"
            placeholder="Export file path (e.g., ~/crane-settings.toml)"
            value={exportPath()}
            onInput={(e) => setExportPath(e.currentTarget.value)}
          />
          <button
            class="px-3 py-2 bg-surface border border-border rounded-full text-sm text-text-primary hover:bg-surface-hover transition-colors shrink-0"
            onClick={handleExport}
          >
            Export
          </button>
        </div>
      </div>

      {/* Import Settings */}
      <div class="space-y-1.5">
        <label class="text-sm font-medium text-text-secondary">
          Import Settings
        </label>
        <div class="flex gap-2">
          <input
            type="text"
            class="flex-1 bg-surface border border-border rounded-full px-3 py-2 text-sm text-text-primary placeholder-text-muted outline-none focus:border-active"
            placeholder="Import file path (e.g., ~/crane-settings.toml)"
            value={importPath()}
            onInput={(e) => setImportPath(e.currentTarget.value)}
          />
          <button
            class="px-3 py-2 bg-surface border border-border rounded-full text-sm text-text-primary hover:bg-surface-hover transition-colors shrink-0"
            onClick={handleImport}
          >
            Import
          </button>
        </div>
      </div>

      {/* Reset to Defaults */}
      <div class="border-t border-border pt-6 space-y-2">
        <div class="text-sm font-medium text-text-primary">
          Reset to Defaults
        </div>
        <div class="text-xs text-text-muted">
          This will reset all settings to their default values. This action
          cannot be undone.
        </div>
        <div class="flex items-center gap-3">
          <button
            class={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              confirmReset()
                ? "bg-error text-white hover:opacity-90"
                : "bg-error/20 text-error hover:bg-error/30"
            }`}
            onClick={handleReset}
          >
            {confirmReset()
              ? "Click again to confirm reset"
              : "Reset to Defaults"}
          </button>
          {confirmReset() && (
            <button
              class="text-sm text-text-muted hover:text-text-primary"
              onClick={() => setConfirmReset(false)}
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
