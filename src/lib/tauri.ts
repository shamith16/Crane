import { invoke, Channel, isTauri } from "@tauri-apps/api/core";
import type {
  Download,
  DownloadProgress,
  DownloadOptions,
  UrlAnalysis,
  DiskSpace,
  AppInfo,
} from "../types/download";
import type { AppConfig } from "../types/settings";

export { isTauri };

// ── Downloads ──────────────────────────────────

export function getDownloads(): Promise<Download[]> {
  return invoke<Download[]>("get_downloads");
}

export function getDownload(id: string): Promise<Download> {
  return invoke<Download>("get_download", { id });
}

export function subscribeProgress(
  downloadId: string,
  onProgress: (progress: DownloadProgress) => void,
): Channel<DownloadProgress> {
  const channel = new Channel<DownloadProgress>();
  channel.onmessage = onProgress;
  invoke("subscribe_progress", { downloadId, onProgress: channel });
  return channel;
}

export function analyzeUrl(url: string): Promise<UrlAnalysis> {
  return invoke<UrlAnalysis>("analyze_url", { url });
}

export function addDownload(url: string, options?: DownloadOptions): Promise<string> {
  return invoke<string>("add_download", { url, options: options ?? null });
}

// ── Download Actions ──────────────────────────

export function pauseDownload(id: string): Promise<void> {
  return invoke("pause_download", { id });
}

export function resumeDownload(id: string): Promise<void> {
  return invoke("resume_download", { id });
}

export function cancelDownload(id: string): Promise<void> {
  return invoke("cancel_download", { id });
}

export function retryDownload(id: string): Promise<void> {
  return invoke("retry_download", { id });
}

export function deleteDownload(id: string, deleteFile: boolean): Promise<void> {
  return invoke("delete_download", { id, deleteFile });
}

export function pauseAllDownloads(): Promise<string[]> {
  return invoke<string[]>("pause_all_downloads");
}

export function resumeAllDownloads(): Promise<string[]> {
  return invoke<string[]>("resume_all_downloads");
}

// ── Files ─────────────────────────────────────

export function openFile(id: string): Promise<void> {
  return invoke("open_file", { id });
}

export function openFolder(id: string): Promise<void> {
  return invoke("open_folder", { id });
}

// ── Settings ──────────────────────────────────

export function getSettings(): Promise<AppConfig> {
  return invoke<AppConfig>("get_settings");
}

export function updateSettings(settings: Record<string, unknown>): Promise<void> {
  return invoke("update_settings", { settings });
}

export function getConfigPath(): Promise<string> {
  return invoke<string>("get_config_path");
}

export function openConfigFile(): Promise<void> {
  return invoke("open_config_file");
}

export function exportSettings(path: string): Promise<void> {
  return invoke("export_settings", { path });
}

export function importSettings(path: string): Promise<void> {
  return invoke("import_settings", { path });
}

export function resetSettings(): Promise<void> {
  return invoke("reset_settings");
}

// ── System ─────────────────────────────────────

export function getDiskSpace(path?: string): Promise<DiskSpace> {
  return invoke<DiskSpace>("get_disk_space", { path: path ?? null });
}

export function getAppInfo(): Promise<AppInfo> {
  return invoke<AppInfo>("get_app_info");
}
