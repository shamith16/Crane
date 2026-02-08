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
    <div class="border-b border-border p-4">
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
          class="flex-1 bg-surface border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary placeholder-text-muted outline-none focus:border-active transition-colors"
          disabled={loading()}
        />
        {!analysis() ? (
          <button
            onClick={handleAnalyze}
            disabled={loading() || !url().trim()}
            class="px-5 py-2.5 bg-border hover:bg-surface-hover text-sm text-text-primary rounded-lg disabled:opacity-40 transition-colors"
          >
            {loading() ? "Analyzing..." : "Analyze"}
          </button>
        ) : (
          <button
            onClick={handleDownload}
            disabled={loading()}
            class="px-5 py-2.5 bg-active hover:bg-active/80 text-sm text-white font-medium rounded-lg disabled:opacity-40 transition-colors"
          >
            {loading() ? "Starting..." : "Download"}
          </button>
        )}
      </div>

      {error() && (
        <p class="mt-2 text-xs text-error">{error()}</p>
      )}

      {analysis() && (
        <div class="mt-3 flex items-center gap-4 text-xs text-text-secondary">
          <span class="text-text-primary font-medium">{analysis()!.filename}</span>
          <span>{formatSize(analysis()!.total_size)}</span>
          <span class="capitalize">{analysis()!.category}</span>
          {analysis()!.resumable && (
            <span class="text-success">Resumable</span>
          )}
        </div>
      )}
    </div>
  );
}
