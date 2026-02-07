import { createSignal } from "solid-js";
import { analyzeUrl, addDownload } from "../lib/commands";
import type { UrlAnalysis } from "../lib/types";

function formatSize(bytes: number | null): string {
  if (bytes === null || bytes === 0) return "Unknown size";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

interface Props {
  onDownloadAdded: () => void;
}

export default function UrlInput(props: Props) {
  const [url, setUrl] = createSignal("");
  const [analysis, setAnalysis] = createSignal<UrlAnalysis | null>(null);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  async function handleAnalyze() {
    const u = url().trim();
    if (!u) return;
    setLoading(true);
    setError(null);
    setAnalysis(null);
    try {
      const result = await analyzeUrl(u);
      setAnalysis(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleDownload() {
    const u = url().trim();
    if (!u) return;
    setLoading(true);
    setError(null);
    try {
      await addDownload(u);
      setUrl("");
      setAnalysis(null);
      props.onDownloadAdded();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      if (analysis()) {
        handleDownload();
      } else {
        handleAnalyze();
      }
    }
  }

  return (
    <div class="border-b border-[#2A2A2A] p-4">
      <div class="flex gap-2">
        <input
          type="text"
          value={url()}
          onInput={(e) => {
            setUrl(e.currentTarget.value);
            setAnalysis(null);
            setError(null);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Paste a download URL..."
          class="flex-1 bg-[#1A1A1A] border border-[#333] rounded-lg px-4 py-2.5 text-sm text-[#E8E8E8] placeholder-[#666] outline-none focus:border-[#4A9EFF] transition-colors"
          disabled={loading()}
        />
        {!analysis() ? (
          <button
            onClick={handleAnalyze}
            disabled={loading() || !url().trim()}
            class="px-5 py-2.5 bg-[#2A2A2A] hover:bg-[#333] text-sm text-[#E8E8E8] rounded-lg disabled:opacity-40 transition-colors"
          >
            {loading() ? "Analyzing..." : "Analyze"}
          </button>
        ) : (
          <button
            onClick={handleDownload}
            disabled={loading()}
            class="px-5 py-2.5 bg-[#4A9EFF] hover:bg-[#3A8EEF] text-sm text-white font-medium rounded-lg disabled:opacity-40 transition-colors"
          >
            {loading() ? "Starting..." : "Download"}
          </button>
        )}
      </div>

      {error() && (
        <p class="mt-2 text-xs text-red-400">{error()}</p>
      )}

      {analysis() && (
        <div class="mt-3 flex items-center gap-4 text-xs text-[#888]">
          <span class="text-[#E8E8E8] font-medium">{analysis()!.filename}</span>
          <span>{formatSize(analysis()!.total_size)}</span>
          <span class="capitalize">{analysis()!.category}</span>
          {analysis()!.resumable && (
            <span class="text-green-400">Resumable</span>
          )}
        </div>
      )}
    </div>
  );
}
