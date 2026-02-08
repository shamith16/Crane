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

export function watchSystemTheme(callback: (isDark: boolean) => void): () => void {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const handler = (e: MediaQueryListEvent) => callback(e.matches);
  mq.addEventListener("change", handler);
  return () => mq.removeEventListener("change", handler);
}
