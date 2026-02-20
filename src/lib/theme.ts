import type { AppearanceConfig } from "./types";

export type ThemeMode = "system" | "light" | "dark";

export function applyTheme(mode: ThemeMode): void {
  const root = document.documentElement;
  root.classList.remove("light");

  if (mode === "light") {
    root.classList.add("light");
  } else if (mode === "system") {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (!prefersDark) {
      root.classList.add("light");
    }
  }
  // "dark" is default — no class needed
}

export function applyAppearance(config: AppearanceConfig): void {
  applyTheme(config.theme);

  const root = document.documentElement;

  // Accent color
  if (config.accent_color && /^#[0-9a-fA-F]{6}$/.test(config.accent_color)) {
    root.style.setProperty("--active", config.accent_color);
    // Derive a slightly darker accent
    root.style.setProperty("--accent", darkenHex(config.accent_color, 15));
    // Update glass
    const [r, g, b] = hexToRgb(config.accent_color);
    root.style.setProperty("--glass", `rgba(${r}, ${g}, ${b}, 0.04)`);
    root.style.setProperty("--glow-active", `0 0 20px rgba(${r}, ${g}, ${b}, 0.25)`);
    root.style.setProperty("--glow-success", `0 0 16px rgba(${r}, ${g}, ${b}, 0.2)`);
  }

  // Window opacity
  document.body.style.opacity = String(config.window_opacity ?? 1);

  // Font size
  const sizeMap = { small: "13px", default: "14px", large: "16px" };
  root.style.fontSize = sizeMap[config.font_size] || "14px";

  // List density — set as data attribute so CSS/components can read it
  root.dataset.density = config.list_density || "comfortable";

  // Compact mode
  if (config.compact_mode) {
    root.dataset.compact = "true";
  } else {
    delete root.dataset.compact;
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function darkenHex(hex: string, percent: number): string {
  const [r, g, b] = hexToRgb(hex);
  const f = 1 - percent / 100;
  const dr = Math.round(r * f);
  const dg = Math.round(g * f);
  const db = Math.round(b * f);
  return `#${((dr << 16) | (dg << 8) | db).toString(16).padStart(6, "0")}`;
}

export function watchSystemTheme(callback: (isDark: boolean) => void): () => void {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const handler = (e: MediaQueryListEvent) => callback(e.matches);
  mq.addEventListener("change", handler);
  return () => mq.removeEventListener("change", handler);
}
