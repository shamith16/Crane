import { For, Show, createSignal, onMount, onCleanup } from "solid-js";
import {
  getDownloads,
  pauseDownload,
  resumeDownload,
  cancelDownload,
  subscribeProgress,
} from "../lib/commands";
import type { Download, DownloadProgress } from "../lib/types";

function formatSize(bytes: number | null): string {
  if (bytes === null || bytes === 0) return "\u2014";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec <= 0) return "\u2014";
  return `${formatSize(bytesPerSec)}/s`;
}

function statusColor(status: string): string {
  switch (status) {
    case "downloading": return "text-blue-400";
    case "completed": return "text-green-400";
    case "failed": return "text-red-400";
    case "paused": return "text-amber-400";
    case "queued": return "text-[#888]";
    default: return "text-[#888]";
  }
}

interface Props {
  refreshTrigger: number;
}

export default function DownloadList(props: Props) {
  const [downloads, setDownloads] = createSignal<Download[]>([]);
  const [progressMap, setProgressMap] = createSignal<Record<string, DownloadProgress>>({});
  let pollInterval: ReturnType<typeof setInterval>;
  const subscribedIds = new Set<string>();

  async function refresh() {
    try {
      const list = await getDownloads();
      setDownloads(list);

      // Subscribe to progress for active downloads
      for (const dl of list) {
        if (dl.status === "downloading" && !subscribedIds.has(dl.id)) {
          subscribedIds.add(dl.id);
          subscribeProgress(dl.id, (progress) => {
            setProgressMap((prev) => ({ ...prev, [progress.download_id]: progress }));
          });
        }
      }
    } catch (e) {
      console.error("Failed to fetch downloads:", e);
    }
  }

  onMount(() => {
    refresh();
    pollInterval = setInterval(refresh, 2000);
  });

  onCleanup(() => {
    clearInterval(pollInterval);
  });

  // Re-fetch when refreshTrigger changes
  const _trigger = () => {
    void props.refreshTrigger;
    refresh();
  };

  function getProgress(dl: Download): { downloaded: number; total: number | null; speed: number } {
    const p = progressMap()[dl.id];
    if (p) {
      return { downloaded: p.downloaded_size, total: p.total_size, speed: p.speed };
    }
    return { downloaded: dl.downloaded_size, total: dl.total_size, speed: dl.speed };
  }

  function percentComplete(dl: Download): number {
    const { downloaded, total } = getProgress(dl);
    if (!total || total === 0) return 0;
    return Math.min(100, (downloaded / total) * 100);
  }

  async function handlePause(id: string) {
    try {
      await pauseDownload(id);
      refresh();
    } catch (e) {
      console.error("Pause failed:", e);
    }
  }

  async function handleResume(id: string) {
    try {
      await resumeDownload(id);
      subscribedIds.delete(id);
      refresh();
    } catch (e) {
      console.error("Resume failed:", e);
    }
  }

  async function handleCancel(id: string) {
    try {
      await cancelDownload(id);
      subscribedIds.delete(id);
      refresh();
    } catch (e) {
      console.error("Cancel failed:", e);
    }
  }

  return (
    <div class="flex-1 overflow-y-auto">
      <Show
        when={downloads().length > 0}
        fallback={
          <div class="flex items-center justify-center h-full">
            <p class="text-sm text-[#666]">No downloads yet. Paste a URL above to start.</p>
          </div>
        }
      >
        <div class="divide-y divide-[#1A1A1A]">
          <For each={downloads()}>
            {(dl) => {
              const progress = () => getProgress(dl);
              const pct = () => percentComplete(dl);

              return (
                <div class="px-4 py-3 hover:bg-[#1A1A1A] transition-colors group">
                  <div class="flex items-center justify-between gap-4">
                    <div class="flex-1 min-w-0">
                      <p class="text-sm text-[#E8E8E8] truncate">{dl.filename}</p>
                      <div class="flex items-center gap-3 mt-1 text-xs tabular-nums">
                        <span class={statusColor(dl.status)}>
                          {dl.status}
                        </span>
                        <span class="text-[#666]">
                          {formatSize(progress().downloaded)}
                          {progress().total ? ` / ${formatSize(progress().total)}` : ""}
                        </span>
                        {dl.status === "downloading" && (
                          <span class="text-[#888]">{formatSpeed(progress().speed)}</span>
                        )}
                      </div>
                    </div>

                    <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {dl.status === "downloading" && (
                        <button
                          onClick={() => handlePause(dl.id)}
                          class="px-2.5 py-1 text-xs bg-[#2A2A2A] hover:bg-[#333] text-[#E8E8E8] rounded"
                        >
                          Pause
                        </button>
                      )}
                      {dl.status === "paused" && (
                        <button
                          onClick={() => handleResume(dl.id)}
                          class="px-2.5 py-1 text-xs bg-[#2A2A2A] hover:bg-[#333] text-[#E8E8E8] rounded"
                        >
                          Resume
                        </button>
                      )}
                      {(dl.status === "downloading" || dl.status === "paused" || dl.status === "queued") && (
                        <button
                          onClick={() => handleCancel(dl.id)}
                          class="px-2.5 py-1 text-xs bg-[#2A2A2A] hover:bg-red-900/50 text-[#E8E8E8] rounded"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>

                  {(dl.status === "downloading" || dl.status === "paused") && (
                    <div class="mt-2 h-1 bg-[#1A1A1A] rounded-full overflow-hidden">
                      <div
                        class={`h-full rounded-full transition-all duration-300 ${
                          dl.status === "paused" ? "bg-amber-400" : "bg-[#4A9EFF]"
                        }`}
                        style={{ width: `${pct()}%` }}
                      />
                    </div>
                  )}

                  {dl.error_message && (
                    <p class="mt-1 text-xs text-red-400">{dl.error_message}</p>
                  )}
                </div>
              );
            }}
          </For>
        </div>
      </Show>
    </div>
  );
}
