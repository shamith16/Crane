import { createSignal, createEffect, onMount, Show } from "solid-js";
import { X } from "lucide-solid";
import { settingsOpen, setSettingsOpen } from "../../stores/ui";
import { getSettings, updateSettings } from "../../lib/commands";
import type { AppConfig } from "../../lib/types";
import GeneralSettings from "./sections/GeneralSettings";
import DownloadsSettings from "./sections/DownloadsSettings";
import FileOrgSettings from "./sections/FileOrgSettings";
import BrowserSettings from "./sections/BrowserSettings";
import NetworkSettings from "./sections/NetworkSettings";
import AdvancedSettings from "./sections/AdvancedSettings";
import ShortcutsSettings from "./sections/ShortcutsSettings";
import AppearanceSettings from "./sections/AppearanceSettings";

type Section =
  | "general"
  | "downloads"
  | "file-org"
  | "browser"
  | "network"
  | "advanced"
  | "shortcuts"
  | "appearance";

const SECTIONS: { id: Section; label: string }[] = [
  { id: "general", label: "General" },
  { id: "downloads", label: "Downloads" },
  { id: "file-org", label: "File Organization" },
  { id: "browser", label: "Browser Integration" },
  { id: "network", label: "Network" },
  { id: "advanced", label: "Advanced" },
  { id: "shortcuts", label: "Keyboard Shortcuts" },
  { id: "appearance", label: "Appearance" },
];

export default function SettingsPanel() {
  const [activeSection, setActiveSection] = createSignal<Section>("general");
  const [config, setConfig] = createSignal<AppConfig | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);

  let saveTimer: ReturnType<typeof setTimeout> | undefined;

  onMount(async () => {
    try {
      const settings = await getSettings();
      setConfig(settings);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  });

  function debouncedSave(updatedConfig: AppConfig) {
    setConfig(updatedConfig);
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      updateSettings(updatedConfig).catch((e) => {
        console.error("Failed to save settings:", e);
      });
    }, 300);
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setSettingsOpen(false);
    }
  }

  return (
    <Show when={settingsOpen()}>
      <div
        class="fixed inset-0 z-40 bg-bg flex flex-col"
        onKeyDown={handleKeyDown}
        tabIndex={-1}
        ref={(el) => requestAnimationFrame(() => el.focus())}
      >
        {/* Header */}
        <div class="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <h1 class="text-lg font-semibold text-text-primary">Settings</h1>
          <button
            class="w-8 h-8 flex items-center justify-center rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
            onClick={() => setSettingsOpen(false)}
            aria-label="Close settings"
          >
            <X size={18} stroke-width={1.75} />
          </button>
        </div>

        {/* Body */}
        <div class="flex flex-1 overflow-hidden">
          {/* Left nav */}
          <nav class="w-56 shrink-0 border-r border-border overflow-y-auto py-2">
            {SECTIONS.map((section) => (
              <button
                class={`w-full text-left px-6 py-2 text-sm transition-colors ${
                  activeSection() === section.id
                    ? "text-active bg-active/10 font-medium"
                    : "text-text-secondary hover:text-text-primary hover:bg-surface-hover"
                }`}
                onClick={() => setActiveSection(section.id)}
              >
                {section.label}
              </button>
            ))}
          </nav>

          {/* Content area */}
          <div class="flex-1 overflow-y-auto p-6">
            <Show when={loading()}>
              <div class="flex items-center justify-center h-full text-text-muted">
                Loading settings...
              </div>
            </Show>

            <Show when={error()}>
              <div class="flex items-center justify-center h-full text-error">
                {error()}
              </div>
            </Show>

            <Show when={config() && !loading()}>
              {(() => {
                const cfg = config()!;
                const save = debouncedSave;

                return (
                  <>
                    <Show when={activeSection() === "general"}>
                      <GeneralSettings config={cfg} onSave={save} />
                    </Show>
                    <Show when={activeSection() === "downloads"}>
                      <DownloadsSettings config={cfg} onSave={save} />
                    </Show>
                    <Show when={activeSection() === "file-org"}>
                      <FileOrgSettings config={cfg} onSave={save} />
                    </Show>
                    <Show when={activeSection() === "browser"}>
                      <BrowserSettings />
                    </Show>
                    <Show when={activeSection() === "network"}>
                      <NetworkSettings config={cfg} onSave={save} />
                    </Show>
                    <Show when={activeSection() === "advanced"}>
                      <AdvancedSettings />
                    </Show>
                    <Show when={activeSection() === "shortcuts"}>
                      <ShortcutsSettings />
                    </Show>
                    <Show when={activeSection() === "appearance"}>
                      <AppearanceSettings config={cfg} onSave={save} />
                    </Show>
                  </>
                );
              })()}
            </Show>
          </div>
        </div>
      </div>
    </Show>
  );
}
