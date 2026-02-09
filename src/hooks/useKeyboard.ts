import { onMount, onCleanup } from "solid-js";
import {
  setCommandPaletteOpen, commandPaletteOpen,
  settingsOpen, setSettingsOpen,
  toggleSidebar,
  selectedDownloadId, closeDetailPanel,
  clearSelection,
} from "../stores/ui";
import { pauseAll, resumeAll } from "../lib/commands";

export function useKeyboard() {
  function handleKeyDown(e: KeyboardEvent) {
    const meta = e.metaKey || e.ctrlKey;
    const shift = e.shiftKey;
    const key = e.key.toLowerCase();

    // Don't intercept when typing in an input/textarea/select
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
      // Allow Escape to still work in inputs
      if (key !== "escape") return;
    }

    // ⌘K — Command palette
    if (meta && key === "k") {
      e.preventDefault();
      setCommandPaletteOpen(!commandPaletteOpen());
      return;
    }

    // ⌘, — Settings
    if (meta && key === ",") {
      e.preventDefault();
      setSettingsOpen(!settingsOpen());
      return;
    }

    // ⌘B — Toggle sidebar
    if (meta && key === "b") {
      e.preventDefault();
      toggleSidebar();
      return;
    }

    // ⌘⇧P — Pause all
    if (meta && shift && key === "p") {
      e.preventDefault();
      pauseAll();
      return;
    }

    // ⌘⇧R — Resume all
    if (meta && shift && key === "r") {
      e.preventDefault();
      resumeAll();
      return;
    }

    // Escape — Close panel/modal/deselect (priority order)
    if (key === "escape") {
      if (commandPaletteOpen()) {
        setCommandPaletteOpen(false);
      } else if (settingsOpen()) {
        setSettingsOpen(false);
      } else if (selectedDownloadId()) {
        closeDetailPanel();
      } else {
        clearSelection();
      }
      return;
    }
  }

  onMount(() => {
    window.addEventListener("keydown", handleKeyDown);
  });

  onCleanup(() => {
    window.removeEventListener("keydown", handleKeyDown);
  });
}
