import { createSignal, createMemo, For, Show } from "solid-js";
import { open } from "@tauri-apps/plugin-dialog";
import { analyzeUrl, addDownload } from "../lib/commands";
import { formatSize } from "../lib/format";
import type { UrlAnalysis, DownloadOptions, FileCategory } from "../lib/types";

const ALL_CATEGORIES: FileCategory[] = [
  "documents",
  "video",
  "audio",
  "images",
  "archives",
  "software",
  "other",
];

function isValidUrl(text: string): boolean {
  try {
    const u = new URL(text);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

interface BatchEntry {
  url: string;
  checked: boolean;
  valid: boolean;
}

interface Props {
  onDownloadAdded: () => void;
}

export default function UrlInput(props: Props) {
  // ─── Single URL state ───────────────────────────
  const [url, setUrl] = createSignal("");
  const [analysis, setAnalysis] = createSignal<UrlAnalysis | null>(null);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  // ─── Options panel state ────────────────────────
  const [showOptions, setShowOptions] = createSignal(false);
  const [savePath, setSavePath] = createSignal("");
  const [filenameOverride, setFilenameOverride] = createSignal("");
  const [connections, setConnections] = createSignal(8);
  const [category, setCategory] = createSignal<FileCategory>("other");

  // ─── Batch mode state ───────────────────────────
  const [batchMode, setBatchMode] = createSignal(false);
  const [batchEntries, setBatchEntries] = createSignal<BatchEntry[]>([]);
  const [batchLoading, setBatchLoading] = createSignal(false);

  const checkedValidCount = createMemo(() =>
    batchEntries().filter((e) => e.checked && e.valid).length,
  );

  // ─── Helpers ────────────────────────────────────

  function resetOptions() {
    setShowOptions(false);
    setSavePath("");
    setFilenameOverride("");
    setConnections(8);
    setCategory("other");
  }

  function applyAnalysisToOptions(result: UrlAnalysis) {
    setFilenameOverride(result.filename);
    setCategory(result.category);
  }

  function buildOptions(): DownloadOptions | undefined {
    const opts: DownloadOptions = {};
    const sp = savePath().trim();
    const fn = filenameOverride().trim();
    const a = analysis();

    if (sp) opts.save_path = sp;
    if (fn && (!a || fn !== a.filename)) opts.filename = fn;
    if (connections() !== 8) opts.connections = connections();
    if (a && category() !== a.category) opts.category = category();

    return Object.keys(opts).length > 0 ? opts : undefined;
  }

  // ─── Single URL handlers ────────────────────────

  async function handleAnalyze() {
    const u = url().trim();
    if (!u) return;
    setLoading(true);
    setError(null);
    setAnalysis(null);
    try {
      const result = await analyzeUrl(u);
      setAnalysis(result);
      applyAnalysisToOptions(result);
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
      await addDownload(u, buildOptions());
      setUrl("");
      setAnalysis(null);
      resetOptions();
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

  // ─── Paste detection for batch mode ─────────────

  function handlePaste(e: ClipboardEvent) {
    const text = e.clipboardData?.getData("text") ?? "";
    const lines = text
      .split(/[\n\r]+/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    // Enter batch mode if paste contains multiple lines with at least 2 URLs
    const urlCount = lines.filter(isValidUrl).length;
    if (lines.length >= 2 && urlCount >= 2) {
      e.preventDefault();
      enterBatchMode(lines);
    }
  }

  function enterBatchMode(lines: string[]) {
    const entries: BatchEntry[] = lines.map((line) => ({
      url: line,
      valid: isValidUrl(line),
      checked: isValidUrl(line),
    }));
    setBatchEntries(entries);
    setBatchMode(true);
    setAnalysis(null);
    resetOptions();
    setError(null);
  }

  function exitBatchMode() {
    setBatchMode(false);
    setBatchEntries([]);
    setUrl("");
    setError(null);
  }

  function toggleBatchEntry(index: number) {
    setBatchEntries((prev) =>
      prev.map((entry, i) =>
        i === index && entry.valid ? { ...entry, checked: !entry.checked } : entry,
      ),
    );
  }

  async function handleBatchDownload() {
    const entries = batchEntries().filter((e) => e.checked && e.valid);
    if (entries.length === 0) return;
    setBatchLoading(true);
    setError(null);
    try {
      for (const entry of entries) {
        await addDownload(entry.url);
      }
      exitBatchMode();
      props.onDownloadAdded();
    } catch (e) {
      setError(String(e));
    } finally {
      setBatchLoading(false);
    }
  }

  async function selectFolder() {
    const selected = await open({ directory: true, multiple: false });
    if (selected) {
      setSavePath(selected as string);
    }
  }

  // ─── Render ─────────────────────────────────────

  return (
    <div class="border-b border-border p-4">
      <Show when={!batchMode()}>
        {/* Single URL mode */}
        <div class="flex gap-2">
          <input
            type="text"
            value={url()}
            onInput={(e) => {
              setUrl(e.currentTarget.value);
              setAnalysis(null);
              setError(null);
              resetOptions();
            }}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder="Paste URL to download or press ⌘K for commands..."
            class="flex-1 bg-surface border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary placeholder-text-muted outline-none focus:border-active transition-colors"
            disabled={loading()}
          />
          <Show when={!analysis()}>
            <button
              onClick={handleAnalyze}
              disabled={loading() || !url().trim()}
              class="px-5 py-2.5 bg-border hover:bg-surface-hover text-sm text-text-primary rounded-lg disabled:opacity-40 transition-colors"
            >
              {loading() ? "Analyzing..." : "Analyze"}
            </button>
          </Show>
          <Show when={analysis()}>
            <button
              onClick={() => setShowOptions((v) => !v)}
              class="px-3 py-2.5 bg-border hover:bg-surface-hover text-sm text-text-secondary rounded-lg transition-colors"
              title="Download options"
            >
              <svg
                class="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="2"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </button>
            <button
              onClick={handleDownload}
              disabled={loading()}
              class="px-5 py-2.5 bg-active hover:bg-active/80 text-sm text-white font-medium rounded-lg disabled:opacity-40 transition-colors"
            >
              {loading() ? "Starting..." : "Download"}
            </button>
          </Show>
        </div>

        {/* Error */}
        <Show when={error()}>
          <p class="mt-2 text-xs text-error">{error()}</p>
        </Show>

        {/* Analysis summary */}
        <Show when={analysis()}>
          {(a) => (
            <div class="mt-3 flex items-center gap-4 text-xs text-text-secondary">
              <span class="text-text-primary font-medium">{a().filename}</span>
              <span>{formatSize(a().total_size)}</span>
              <span class="capitalize">{a().category}</span>
              <Show when={a().resumable}>
                <span class="text-success">Resumable</span>
              </Show>
            </div>
          )}
        </Show>

        {/* Options panel */}
        <Show when={showOptions() && analysis()}>
          <div class="mt-3 p-3 bg-surface border border-border rounded-lg space-y-3">
            {/* Save location */}
            <div class="flex items-center gap-2">
              <label class="text-xs text-text-secondary w-24 shrink-0">Save to</label>
              <input
                type="text"
                value={savePath()}
                onInput={(e) => setSavePath(e.currentTarget.value)}
                placeholder="Default download location"
                class="flex-1 bg-background border border-border rounded px-3 py-1.5 text-xs text-text-primary placeholder-text-muted outline-none focus:border-active transition-colors"
              />
              <button
                onClick={selectFolder}
                class="px-3 py-1.5 bg-border hover:bg-surface-hover text-xs text-text-secondary rounded transition-colors"
                title="Browse folder"
              >
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
              </button>
            </div>

            {/* Filename */}
            <div class="flex items-center gap-2">
              <label class="text-xs text-text-secondary w-24 shrink-0">Filename</label>
              <input
                type="text"
                value={filenameOverride()}
                onInput={(e) => setFilenameOverride(e.currentTarget.value)}
                class="flex-1 bg-background border border-border rounded px-3 py-1.5 text-xs text-text-primary outline-none focus:border-active transition-colors"
              />
            </div>

            {/* Connections */}
            <div class="flex items-center gap-2">
              <label class="text-xs text-text-secondary w-24 shrink-0">Connections</label>
              <input
                type="range"
                min="1"
                max="32"
                value={connections()}
                onInput={(e) => setConnections(parseInt(e.currentTarget.value, 10))}
                class="flex-1 accent-active"
              />
              <span class="text-xs text-text-primary tabular-nums w-6 text-right">
                {connections()}
              </span>
            </div>

            {/* Category */}
            <div class="flex items-center gap-2">
              <label class="text-xs text-text-secondary w-24 shrink-0">Category</label>
              <select
                value={category()}
                onChange={(e) => setCategory(e.currentTarget.value as FileCategory)}
                class="flex-1 bg-background border border-border rounded px-3 py-1.5 text-xs text-text-primary outline-none focus:border-active transition-colors"
              >
                <For each={ALL_CATEGORIES}>
                  {(cat) => (
                    <option value={cat} class="capitalize">
                      {cat.charAt(0).toUpperCase() + cat.slice(1)}
                    </option>
                  )}
                </For>
              </select>
            </div>
          </div>
        </Show>
      </Show>

      {/* Batch URL mode */}
      <Show when={batchMode()}>
        <div class="space-y-3">
          <div class="text-xs text-text-secondary font-medium">
            Batch download — {checkedValidCount()} URL{checkedValidCount() !== 1 ? "s" : ""} selected
          </div>

          <div class="max-h-48 overflow-y-auto border border-border rounded-lg bg-surface divide-y divide-border">
            <For each={batchEntries()}>
              {(entry, index) => (
                <label
                  class={`flex items-center gap-3 px-3 py-2 text-xs cursor-pointer hover:bg-surface-hover transition-colors ${
                    !entry.valid ? "opacity-50" : ""
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={entry.checked}
                    disabled={!entry.valid}
                    onChange={() => toggleBatchEntry(index())}
                    class="accent-active"
                  />
                  <span
                    class={`flex-1 truncate ${
                      entry.valid ? "text-text-primary" : "text-text-muted line-through"
                    }`}
                  >
                    {entry.url}
                  </span>
                  <Show when={!entry.valid}>
                    <span class="text-text-muted shrink-0">Not a valid URL</span>
                  </Show>
                </label>
              )}
            </For>
          </div>

          <Show when={error()}>
            <p class="text-xs text-error">{error()}</p>
          </Show>

          <div class="flex gap-2 justify-end">
            <button
              onClick={exitBatchMode}
              disabled={batchLoading()}
              class="px-4 py-2 bg-border hover:bg-surface-hover text-xs text-text-primary rounded-lg disabled:opacity-40 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleBatchDownload}
              disabled={batchLoading() || checkedValidCount() === 0}
              class="px-4 py-2 bg-active hover:bg-active/80 text-xs text-white font-medium rounded-lg disabled:opacity-40 transition-colors"
            >
              {batchLoading()
                ? "Starting..."
                : `Download All (${checkedValidCount()})`}
            </button>
          </div>
        </div>
      </Show>
    </div>
  );
}
