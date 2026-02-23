import { Show, type Component } from "solid-js";
import { Pause, Play, X, RotateCcw, FolderOpen, FileSearch } from "lucide-solid";
import type { Download } from "../../types/download";

interface DetailActionsProps {
  download: Download;
}

const DetailActions: Component<DetailActionsProps> = (props) => {
  const dl = () => props.download;
  const isActive = () => dl().status === "downloading" || dl().status === "analyzing";
  const isPaused = () => dl().status === "paused";
  const isFailed = () => dl().status === "failed";
  const isCompleted = () => dl().status === "completed";

  return (
    <div class="flex flex-col gap-[8px]">
      <Show when={isActive()}>
        <button class="flex items-center justify-center gap-[6px] w-full rounded-md py-[8px] border border-surface text-secondary cursor-pointer hover:bg-hover transition-colors">
          <Pause size={14} />
          <span class="text-caption font-semibold font-mono tracking-wide">PAUSE</span>
        </button>
      </Show>

      <Show when={isPaused()}>
        <button class="flex items-center justify-center gap-[6px] w-full rounded-md py-[8px] bg-accent text-inverted cursor-pointer hover:bg-accent/80 transition-colors">
          <Play size={14} />
          <span class="text-caption font-semibold font-mono tracking-wide">RESUME</span>
        </button>
      </Show>

      <Show when={isFailed()}>
        <button class="flex items-center justify-center gap-[6px] w-full rounded-md py-[8px] bg-accent text-inverted cursor-pointer hover:bg-accent/80 transition-colors">
          <RotateCcw size={14} />
          <span class="text-caption font-semibold font-mono tracking-wide">RETRY</span>
        </button>
      </Show>

      <Show when={isCompleted()}>
        <button class="flex items-center justify-center gap-[6px] w-full rounded-md py-[8px] bg-accent text-inverted cursor-pointer hover:bg-accent/80 transition-colors">
          <FolderOpen size={14} />
          <span class="text-caption font-semibold font-mono tracking-wide">OPEN FOLDER</span>
        </button>
        <button class="flex items-center justify-center gap-[6px] w-full rounded-md py-[8px] border border-surface text-secondary cursor-pointer hover:bg-hover transition-colors">
          <FileSearch size={14} />
          <span class="text-caption font-semibold font-mono tracking-wide">OPEN FILE</span>
        </button>
      </Show>

      <Show when={isActive() || isPaused()}>
        <button class="flex items-center justify-center gap-[6px] w-full rounded-md py-[8px] border border-error text-error cursor-pointer hover:bg-error/10 transition-colors">
          <X size={14} />
          <span class="text-caption font-semibold font-mono tracking-wide">CANCEL</span>
        </button>
      </Show>
    </div>
  );
};

export default DetailActions;
