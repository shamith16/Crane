import { createSignal, Show, type Component } from "solid-js";
import { Link } from "lucide-solid";
import { useDownloads } from "../../stores/downloads";
import DownloadDialog from "../dialog/DownloadDialog";
import BatchDownloadDialog from "../dialog/BatchDownloadDialog";

function parseUrls(input: string): string[] {
  // Split on commas, spaces, newlines first
  const rough = input.split(/[,\s\n]+/).filter(Boolean);

  // Re-join and split on http(s):// boundaries for concatenated URLs
  const joined = rough.join(" ");
  const parts = joined.split(/(?=https?:\/\/)/i);

  return parts
    .map((s) => s.trim())
    .filter((s) => /^https?:\/\/.+/i.test(s));
}

const TopBar: Component = () => {
  const { refreshDownloads } = useDownloads();
  const [url, setUrl] = createSignal("");
  const [singleUrl, setSingleUrl] = createSignal<string | null>(null);
  const [batchUrls, setBatchUrls] = createSignal<string[] | null>(null);

  const launchDialogs = (urls: string[]) => {
    if (urls.length === 0) return;
    if (urls.length === 1) {
      setSingleUrl(urls[0]);
    } else {
      setBatchUrls(urls);
    }
  };

  const submit = () => {
    const trimmed = url().trim();
    if (!trimmed) return;
    launchDialogs(parseUrls(trimmed));
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") submit();
  };

  const handlePaste = (e: ClipboardEvent) => {
    const pasted = e.clipboardData?.getData("text")?.trim();
    if (pasted) {
      e.preventDefault();
      const urls = parseUrls(pasted);
      if (urls.length === 0) return;
      setUrl(urls.length === 1 ? urls[0] : `${urls.length} URLs pasted`);
      launchDialogs(urls);
    }
  };

  const handleClose = () => {
    setSingleUrl(null);
    setBatchUrls(null);
  };

  const handleAdded = () => {
    setUrl("");
    refreshDownloads();
  };

  return (
    <>
      <div class="shrink-0 px-[16px] py-[8px]">
        <div class="flex items-center h-[36px] px-[12px] gap-sm bg-inset rounded-full">
          <Link size={16} class="text-muted shrink-0" />

          <input
            type="text"
            data-url-input
            placeholder="Paste URL to start download..."
            class="flex-1 bg-transparent text-body font-mono text-primary placeholder:text-muted outline-none"
            value={url()}
            onInput={(e) => setUrl(e.currentTarget.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
          />
        </div>
      </div>

      <Show when={singleUrl()}>
        <DownloadDialog
          url={singleUrl()!}
          onClose={handleClose}
          onAdded={handleAdded}
        />
      </Show>

      <Show when={batchUrls()}>
        <BatchDownloadDialog
          urls={batchUrls()!}
          onClose={handleClose}
          onAdded={handleAdded}
        />
      </Show>
    </>
  );
};

export default TopBar;
