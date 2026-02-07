import { invoke } from "@tauri-apps/api/core";
import { Channel } from "@tauri-apps/api/core";
import type {
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
