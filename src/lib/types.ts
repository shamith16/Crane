export type DownloadStatus =
  | "pending"
  | "analyzing"
  | "downloading"
  | "paused"
  | "completed"
  | "failed"
  | "queued";

export type FileCategory =
  | "documents"
  | "video"
  | "audio"
  | "images"
  | "archives"
  | "software"
  | "other";

export interface UrlAnalysis {
  url: string;
  filename: string;
  total_size: number | null;
  mime_type: string | null;
  resumable: boolean;
  category: FileCategory;
  server: string | null;
}

export interface Download {
  id: string;
  url: string;
  filename: string;
  save_path: string;
  total_size: number | null;
  downloaded_size: number;
  status: DownloadStatus;
  error_message: string | null;
  error_code: string | null;
  mime_type: string | null;
  category: FileCategory;
  resumable: boolean;
  connections: number;
  speed: number;
  source_domain: string | null;
  referrer: string | null;
  cookies: string | null;
  user_agent: string | null;
  queue_position: number | null;
  retry_count: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
}

export interface DownloadProgress {
  download_id: string;
  downloaded_size: number;
  total_size: number | null;
  speed: number;
  eta_seconds: number | null;
  connections: ConnectionProgress[];
}

export interface ConnectionProgress {
  connection_num: number;
  downloaded: number;
  range_start: number;
  range_end: number;
}

export interface ExpectedHash {
  algorithm: "sha256" | "md5";
  value: string;
}

export interface DownloadOptions {
  save_path?: string;
  filename?: string;
  connections?: number;
  category?: FileCategory;
  referrer?: string;
  cookies?: string;
  user_agent?: string;
  headers?: Record<string, string>;
  expected_hash?: ExpectedHash;
}

// ─── Config Types ──────────────────────────────

export interface AppConfig {
  general: GeneralConfig;
  downloads: DownloadsConfig;
  file_organization: FileOrgConfig;
  network: NetworkConfig;
  appearance: AppearanceConfig;
}

export interface GeneralConfig {
  download_location: string;
  launch_at_startup: boolean;
  minimize_to_tray: boolean;
  notification_level: "all" | "failed_only" | "never";
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
  duplicate_handling: "ask" | "rename" | "overwrite" | "skip";
  category_folders: Record<string, string>;
}

export interface NetworkConfig {
  proxy: ProxyConfig;
  user_agent: string | null;
  speed_schedule: SpeedScheduleEntry[];
}

export interface ProxyConfig {
  mode: "none" | "system" | "http" | "socks5";
  host: string | null;
  port: number | null;
  username: string | null;
  password: string | null;
}

export interface AppearanceConfig {
  theme: "system" | "light" | "dark";
  accent_color: string;
  font_size: "small" | "default" | "large";
  compact_mode: boolean;
  list_density: "compact" | "comfortable" | "cozy";
  window_opacity: number;
}

export interface SpeedScheduleEntry {
  start_hour: number;
  end_hour: number;
  limit: number | null;
}

export interface AppInfo {
  version: string;
  data_dir: string;
}

export interface DiskSpace {
  free_bytes: number;
  total_bytes: number;
}
