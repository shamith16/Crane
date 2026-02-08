import { invoke } from "@tauri-apps/api/core";
import { Channel } from "@tauri-apps/api/core";
import type {
  AppConfig,
  AppInfo,
  Download,
  DownloadOptions,
  DownloadProgress,
  UrlAnalysis,
} from "./types";

export async function analyzeUrl(url: string): Promise<UrlAnalysis> {
  return invoke("analyze_url", { url });
}

export async function addDownload(
  url: string,
  options?: DownloadOptions,
): Promise<string> {
  return invoke("add_download", { url, options: options ?? null });
}

export async function pauseDownload(id: string): Promise<void> {
  return invoke("pause_download", { id });
}

export async function resumeDownload(id: string): Promise<void> {
  return invoke("resume_download", { id });
}

export async function cancelDownload(id: string): Promise<void> {
  return invoke("cancel_download", { id });
}

export async function getDownloads(): Promise<Download[]> {
  return invoke("get_downloads");
}

export async function getDownload(id: string): Promise<Download> {
  return invoke("get_download", { id });
}

export function subscribeProgress(
  downloadId: string,
  onProgress: (progress: DownloadProgress) => void,
): void {
  const channel = new Channel<DownloadProgress>();
  channel.onmessage = onProgress;
  invoke("subscribe_progress", {
    downloadId,
    onProgress: channel,
  });
}

// ─── Settings ──────────────────────────────────

export async function getSettings(): Promise<AppConfig> {
  return invoke("get_settings");
}

export async function updateSettings(settings: Partial<AppConfig>): Promise<void> {
  return invoke("update_settings", { settings });
}

export async function getConfigPath(): Promise<string> {
  return invoke("get_config_path");
}

export async function openConfigFile(): Promise<void> {
  return invoke("open_config_file");
}

export async function exportSettings(path: string): Promise<void> {
  return invoke("export_settings", { path });
}

export async function importSettings(path: string): Promise<void> {
  return invoke("import_settings", { path });
}

export async function resetSettings(): Promise<void> {
  return invoke("reset_settings");
}

// ─── File Operations ───────────────────────────

export async function openFile(id: string): Promise<void> {
  return invoke("open_file", { id });
}

export async function openFolder(id: string): Promise<void> {
  return invoke("open_folder", { id });
}

export async function calculateHash(id: string, algorithm: "sha256" | "md5"): Promise<string> {
  return invoke("calculate_hash", { id, algorithm });
}

export async function getDownloadPath(id: string): Promise<string> {
  return invoke("get_download_path", { id });
}

// ─── Extended Download Operations ──────────────

export async function retryDownload(id: string): Promise<void> {
  return invoke("retry_download", { id });
}

export async function deleteDownload(id: string, deleteFile: boolean): Promise<void> {
  return invoke("delete_download", { id, deleteFile });
}

export async function pauseAll(): Promise<string[]> {
  return invoke("pause_all_downloads");
}

export async function resumeAll(): Promise<string[]> {
  return invoke("resume_all_downloads");
}

export async function deleteCompleted(): Promise<number> {
  return invoke("delete_completed");
}

// ─── System ────────────────────────────────────

export async function getAppInfo(): Promise<AppInfo> {
  return invoke("get_app_info");
}
