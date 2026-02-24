import {
  createContext,
  useContext,
  onMount,
  type ParentComponent,
} from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { isTauri, getSettings, updateSettings } from "../lib/tauri";
import type { AppConfig } from "../types/settings";

const defaultConfig: AppConfig = {
  general: {
    download_location: "~/Downloads",
    launch_at_startup: false,
    minimize_to_tray: true,
    notification_level: "all",
    language: "en",
    auto_update: true,
  },
  downloads: {
    default_connections: 8,
    max_concurrent: 3,
    bandwidth_limit: null,
    auto_resume: true,
    large_file_threshold: null,
  },
  file_organization: {
    auto_categorize: true,
    date_subfolders: false,
    duplicate_handling: "ask",
    category_folders: {},
  },
  network: {
    proxy: {
      mode: "none",
      host: null,
      port: null,
      username: null,
      password: null,
    },
    user_agent: null,
    speed_schedule: [],
  },
  appearance: {
    theme: "dark",
    accent_color: "#3B82F6",
    font_size: "default",
    compact_mode: false,
    list_density: "comfortable",
    window_opacity: 1.0,
  },
};

interface SettingsStore {
  config: AppConfig;
  loading: boolean;
  update: (path: string, value: unknown) => Promise<void>;
  reload: () => Promise<void>;
}

const SettingsContext = createContext<SettingsStore>();

export const SettingsProvider: ParentComponent = (props) => {
  const [config, setConfig] = createStore<AppConfig>(structuredClone(defaultConfig));
  const [state, setState] = createStore({ loading: true });

  const reload = async () => {
    if (!isTauri()) {
      setState("loading", false);
      return;
    }
    try {
      const remote = await getSettings();
      setConfig(reconcile(remote));
    } catch (e) {
      console.error("[crane] failed to load settings:", e);
    }
    setState("loading", false);
  };

  const update = async (path: string, value: unknown) => {
    // Build nested object from dot path: "general.language" → { general: { language: "en" } }
    const parts = path.split(".");
    const patch: Record<string, unknown> = {};
    let current = patch;
    for (let i = 0; i < parts.length - 1; i++) {
      current[parts[i]] = {};
      current = current[parts[i]] as Record<string, unknown>;
    }
    current[parts[parts.length - 1]] = value;

    // Optimistic local update
    const keys = parts as [string, ...string[]];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (setConfig as any)(...keys, value);

    if (isTauri()) {
      try {
        await updateSettings(patch);
      } catch (e) {
        console.error("[crane] failed to update settings:", e);
        await reload();
      }
    }
  };

  onMount(reload);

  const store: SettingsStore = {
    get config() { return config; },
    get loading() { return state.loading; },
    update,
    reload,
  };

  return (
    <SettingsContext.Provider value={store}>
      {props.children}
    </SettingsContext.Provider>
  );
};

export function useSettings(): SettingsStore {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
