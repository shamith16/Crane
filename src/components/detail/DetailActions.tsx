import { Show, type Component } from "solid-js";
import { Pause, Play, X, RotateCcw, FolderOpen, FileSearch } from "lucide-solid";
import type { Download } from "../../types/download";
import {
  isTauri,
  pauseDownload,
  resumeDownload,
  cancelDownload,
  retryDownload,
  openFile,
  openFolder,
} from "../../lib/tauri";

interface DetailActionsProps {
  download: Download;
}

const DetailActions: Component<DetailActionsProps> = (props) => {
  const dl = () => props.download;
  const isActive = () => dl().status === "downloading" || dl().status === "analyzing";
  const isPaused = () => dl().status === "paused";
  const isFailed = () => dl().status === "failed";
  const isCompleted = () => dl().status === "completed";

  const action = async (fn: () => Promise<void>) => {
    if (!isTauri()) return;
    try { await fn(); } catch (e) { console.error("[crane] action failed:", e); }
  };

  return (
    <div class="flex flex-col gap-[8px]">
      <Show when={isActive()}>
        <button
          class="flex items-center justify-center gap-[6px] w-full rounded-md py-[8px] bg-inset border border-surface text-secondary cursor-pointer hover:bg-hover transition-colors"
          onClick={() => action(() => pauseDownload(dl().id))}
        >
          <Pause size={14} />
          <span class="text-caption font-semibold font-mono tracking-[1px]">PAUSE</span>
        </button>
      </Show>

      <Show when={isPaused()}>
        <button
          class="flex items-center justify-center gap-[6px] w-full rounded-md py-[8px] bg-accent text-inverted cursor-pointer hover:bg-accent/80 transition-colors"
          onClick={() => action(() => resumeDownload(dl().id))}
        >
          <Play size={14} />
          <span class="text-caption font-semibold font-mono tracking-[1px]">RESUME</span>
        </button>
      </Show>

      <Show when={isFailed()}>
        <button
          class="flex items-center justify-center gap-[6px] w-full rounded-md py-[8px] bg-accent text-inverted cursor-pointer hover:bg-accent/80 transition-colors"
          onClick={() => action(() => retryDownload(dl().id))}
        >
          <RotateCcw size={14} />
          <span class="text-caption font-semibold font-mono tracking-[1px]">RETRY</span>
        </button>
      </Show>

      <Show when={isCompleted()}>
        <button
          class="flex items-center justify-center gap-[6px] w-full rounded-md py-[8px] bg-accent text-inverted cursor-pointer hover:bg-accent/80 transition-colors"
          onClick={() => action(() => openFolder(dl().id))}
        >
          <FolderOpen size={14} />
          <span class="text-caption font-semibold font-mono tracking-[1px]">OPEN FOLDER</span>
        </button>
        <button
          class="flex items-center justify-center gap-[6px] w-full rounded-md py-[8px] bg-inset border border-surface text-secondary cursor-pointer hover:bg-hover transition-colors"
          onClick={() => action(() => openFile(dl().id))}
        >
          <FileSearch size={14} />
          <span class="text-caption font-semibold font-mono tracking-[1px]">OPEN FILE</span>
        </button>
      </Show>

      <Show when={isActive() || isPaused()}>
        <button
          class="flex items-center justify-center gap-[6px] w-full rounded-md py-[8px] bg-inset border border-error text-error cursor-pointer hover:bg-error/10 transition-colors"
          onClick={() => action(() => cancelDownload(dl().id))}
        >
          <X size={14} />
          <span class="text-caption font-semibold font-mono tracking-[1px]">CANCEL</span>
        </button>
      </Show>
    </div>
  );
};

export default DetailActions;
