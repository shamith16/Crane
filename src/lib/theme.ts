import type { Theme } from "../types/settings";

/**
 * Darken a hex color by multiplying each RGB channel by `factor`.
 * factor=0.6 → 40% darker.
 */
function darken(hex: string, factor: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const clamp = (n: number) => Math.min(255, Math.max(0, Math.round(n * factor)));
  return `#${clamp(r).toString(16).padStart(2, "0")}${clamp(g).toString(16).padStart(2, "0")}${clamp(b).toString(16).padStart(2, "0")}`;
}

/** Apply accent color + derived accent-muted to :root CSS variables. */
export function applyAccent(hex: string): void {
  const el = document.documentElement;
  el.style.setProperty("--color-accent", hex);
  el.style.setProperty("--color-accent-muted", darken(hex, 0.6));
}

/** Resolve theme preference and set data-theme attribute on :root. */
export function applyTheme(theme: Theme): void {
  const resolved =
    theme === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : theme;
  document.documentElement.dataset.theme = resolved;
}

/** Apply window opacity to the root element. */
export function applyWindowOpacity(opacity: number): void {
  const el = document.getElementById("root");
  if (el) el.style.opacity = String(opacity);
}
