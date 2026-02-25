import { createSignal, Show, type Component } from "solid-js";
import { Link, ClipboardPaste } from "lucide-solid";
import { useDownloads } from "../../stores/downloads";
import DownloadDialog from "../dialog/DownloadDialog";

const TopBar: Component = () => {
  const { refreshDownloads } = useDownloads();
  const [url, setUrl] = createSignal("");
  const [dialogUrl, setDialogUrl] = createSignal<string | null>(null);

  const submit = () => {
    const trimmed = url().trim();
    if (!trimmed) return;
    setDialogUrl(trimmed);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") submit();
  };

  const handleClose = () => {
    setDialogUrl(null);
  };

  const handleAdded = () => {
    setUrl("");
    refreshDownloads();
  };

  return (
    <>
      <div class="flex items-center h-[48px] shrink-0 px-lg gap-sm bg-inset border-b border-border">
        <Link size={16} class="text-muted shrink-0" />

        <input
          type="text"
          placeholder="Paste URL to start download..."
          class="flex-1 bg-transparent text-body font-mono text-primary placeholder:text-muted outline-none"
          value={url()}
          onInput={(e) => setUrl(e.currentTarget.value)}
          onKeyDown={handleKeyDown}
        />

        <button
          class="flex items-center gap-xs bg-accent hover:bg-accent/80 text-inverted rounded-md px-md py-xs cursor-pointer transition-colors shrink-0"
          onClick={submit}
        >
          <ClipboardPaste size={14} />
          <span class="text-caption font-mono font-semibold tracking-[1px]">ADD URL</span>
        </button>
      </div>

      <Show when={dialogUrl()}>
        <DownloadDialog
          url={dialogUrl()!}
          onClose={handleClose}
          onAdded={handleAdded}
        />
      </Show>
    </>
  );
};

export default TopBar;
