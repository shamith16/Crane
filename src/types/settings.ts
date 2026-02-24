// Mirrors crates/crane-core/src/config/types.rs

export type NotificationLevel = "all" | "failedonly" | "never";
export type DuplicateAction = "ask" | "rename" | "overwrite" | "skip";
export type ProxyMode = "none" | "system" | "http" | "socks5";
export type Theme = "system" | "light" | "dark";
export type FontSize = "small" | "default" | "large";
export type ListDensity = "compact" | "comfortable" | "cozy";

export interface GeneralConfig {
  download_location: string;
  launch_at_startup: boolean;
  minimize_to_tray: boolean;
  notification_level: NotificationLevel;
  language: string;
  auto_update: boolean;
}

export interface DownloadsConfig {
  default_connections: number;
  max_concurrent: number;
  bandwidth_limit: number | null;
  auto_resume: boolean;
  large_file_threshold: number | null;
}

export interface FileOrgConfig {
  auto_categorize: boolean;
  date_subfolders: boolean;
  duplicate_handling: DuplicateAction;
  category_folders: Record<string, string>;
}

export interface ProxyConfig {
  mode: ProxyMode;
  host: string | null;
  port: number | null;
  username: string | null;
  password: string | null;
}

export interface SpeedScheduleEntry {
  start_hour: number;
  end_hour: number;
  limit: number | null;
}

export interface NetworkConfig {
  proxy: ProxyConfig;
  user_agent: string | null;
  speed_schedule: SpeedScheduleEntry[];
}

export interface AppearanceConfig {
  theme: Theme;
  accent_color: string;
  font_size: FontSize;
  compact_mode: boolean;
  list_density: ListDensity;
  window_opacity: number;
}

export interface AppConfig {
  general: GeneralConfig;
  downloads: DownloadsConfig;
  file_organization: FileOrgConfig;
  network: NetworkConfig;
  appearance: AppearanceConfig;
}
