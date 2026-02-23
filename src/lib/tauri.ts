import { invoke, Channel, isTauri } from "@tauri-apps/api/core";
import type {
  Download,
  DownloadProgress,
  DiskSpace,
  AppInfo,
} from "../types/download";

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

// ── System ─────────────────────────────────────

export function getDiskSpace(path?: string): Promise<DiskSpace> {
  return invoke<DiskSpace>("get_disk_space", { path: path ?? null });
}

export function getAppInfo(): Promise<AppInfo> {
  return invoke<AppInfo>("get_app_info");
}
